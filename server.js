import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';
import { Store } from './lib/store.js';
import { Gemini, normalizeApiKey } from './lib/gemini.js';
import { selectModels } from './lib/models.js';
import { JobRunner, publicJob } from './lib/jobs.js';
import { AppError, MODELS, validateSettings } from './lib/content.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.png': 'image/png', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Envie os dados como JSON.', 415);
  let size = 0, chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 160000) throw new AppError('Solicitação muito grande.', 413); chunks.push(chunk); }
  try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!result || typeof result !== 'object' || Array.isArray(result)) throw 0; return result; } catch { throw new AppError('Dados inválidos.'); }
}
async function sendFile(req, res, path, downloadName) {
  const info = await stat(path).catch(() => { throw new AppError('Arquivo ainda não disponível.', 404); });
  if (!info.isFile()) throw new AppError('Arquivo não encontrado.', 404);
  const headers = { 'Content-Type': MIME[extname(path)] || 'application/octet-stream', 'Cache-Control': 'private, no-cache', 'Accept-Ranges': 'bytes', ...(downloadName ? { 'Content-Disposition': `attachment; filename="${downloadName}"` } : {}) };
  let start = 0, end = info.size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    if (!match[1]) start = Math.max(0, info.size - Number(match[2])); else start = Number(match[1]);
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    if (start > end || start >= info.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1); res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(path, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
export function createApp({ dataDir = process.env.DATA_DIR || join(ROOT, '.data'), provider = new Gemini(), concurrency = 2 } = {}) {
  const store = new Store(dataDir), runner = new JobRunner(store, provider, concurrency), limits = new Map();
  const videoAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0 && spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;
  function rate(key, max = 100) {
    const now = Date.now(), old = limits.get(key), value = old && old.time > now - 60000 ? old : { time: now, n: 0 };
    if (++value.n > max) throw new AppError('Muitas solicitações. Aguarde um minuto.', 429);
    limits.set(key, value);
    if (limits.size > 5000) for (const [k, v] of limits) if (v.time < now - 60000) limits.delete(k);
  }
  function workspace(req, res) {
    const token = /(?:^|;\s*)ls_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    let id = token ? createHash('sha256').update(token).digest('hex') : null;
    if (!id || !store.workspace(id)) {
      rate(`new:${req.socket.remoteAddress}`, 60);
      const next = randomBytes(32).toString('hex'); id = createHash('sha256').update(next).digest('hex'); store.createWorkspace(id);
      res.setHeader('Set-Cookie', `ls_session=${next}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
    }
    return id;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/healthz') return json(res, 200, { status: 'ok', videoAvailable });
      if (path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'HEAD'].includes(req.method)) {
          const origin = req.headers.origin;
          if (req.headers['sec-fetch-site'] === 'cross-site' || !origin || new URL(origin).host !== req.headers.host || !['http:', 'https:'].includes(new URL(origin).protocol)) throw new AppError('Origem da solicitação não permitida.', 403);
        }
        const ws = workspace(req, res); rate(ws, 240);
        if (path === '/api/session' && req.method === 'GET') return json(res, 200, { ...store.workspace(ws), id: undefined, defaults: MODELS, videoAvailable });
        if (path === '/api/settings' && req.method === 'PUT') {
          rate(`settings:${ws}`, 10); const input = await body(req), patch = validateSettings(input); let models;
          if (input.apiKey !== undefined) {
            if (input.apiKey === '') throw new AppError('Use Desconectar para remover uma chave.');
            input.apiKey = normalizeApiKey(input.apiKey);
            models = await provider.validateKey(input.apiKey);
            patch.models = selectModels(models, patch.models);
          }
          const value = store.settings(ws, patch, input.apiKey); return json(res, 200, { ...value, id: undefined, models });
        }
        if (path === '/api/settings/key' && req.method === 'DELETE') {
          if (store.jobs(ws).some(j => ['queued', 'researching', 'writing', 'imaging', 'narrating', 'rendering'].includes(j.status))) throw new AppError('Cancele ou aguarde as criações antes de desconectar.', 409);
          store.settings(ws, {}, null); return json(res, 200, { connected: false });
        }
        if (path === '/api/models' && req.method === 'GET') {
          rate(`models:${ws}`, 6); const key = store.apiKey(ws); if (!key) throw new AppError('Conecte sua chave primeiro.', 409);
          return json(res, 200, { models: await provider.validateKey(key) });
        }
        if (path === '/api/models/auto' && req.method === 'POST') {
          rate(`models:${ws}`, 6); const key = store.apiKey(ws);
          if (!key) throw new AppError('Conecte sua chave primeiro.', 409);
          const available = await provider.validateKey(key);
          const models = selectModels(available);
          const value = store.settings(ws, { models });
          return json(res, 200, { settings: value.settings, models: available });
        }
        if (path === '/api/jobs' && req.method === 'GET') return json(res, 200, { jobs: store.jobs(ws).map(j => publicJob(j, true)) });
        if (path === '/api/jobs' && req.method === 'POST') {
          rate(`create:${ws}`, 10); const input = await body(req);
          if (input.format === 'reel' && !videoAvailable) throw new AppError('Exportação de vídeo indisponível neste servidor. Instale o FFmpeg.', 503);
          return json(res, 202, publicJob(runner.create(ws, input)));
        }
        const match = /^\/api\/jobs\/([a-f0-9-]{36})(?:\/(cancel|retry|files|download|search-widget)(?:\/([a-z0-9.-]+))?)?$/.exec(path);
        if (match) {
          const [, id, action, filename] = match, job = runner.get(id, ws);
          if (!action && req.method === 'GET') return json(res, 200, publicJob(job));
          if (!action && req.method === 'PATCH') return json(res, 200, publicJob(await runner.edit(id, ws, await body(req))));
          if (!action && req.method === 'DELETE') { await runner.remove(id, ws); return json(res, 200, { deleted: true }); }
          if (action === 'cancel' && req.method === 'POST') return json(res, 200, publicJob(runner.cancel(id, ws)));
          if (action === 'retry' && req.method === 'POST') return json(res, 202, publicJob(runner.retry(id, ws)));
          if (action === 'search-widget' && req.method === 'GET') {
            res.setHeader('Content-Security-Policy', "sandbox allow-popups; default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'");
            res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(job.research?.suggestions || '<p>Sem sugestões de pesquisa.</p>'); return;
          }
          if (action === 'files' && ['GET', 'HEAD'].includes(req.method) && /^(slide-\d{1,2}\.png|video\.mp4|legenda\.txt|impressao\.pdf)$/.test(filename || '')) {
            return sendFile(req, res, join(runner.dir(job), filename), new URL(req.url, 'http://localhost').searchParams.has('download') ? filename : undefined);
          }
          if (action === 'download' && req.method === 'GET') {
            if (job.status !== 'completed') throw new AppError('Aguarde a criação finalizar para baixar.', 409);
            const files = { 'legenda.txt': await readFile(join(runner.dir(job), 'legenda.txt')), 'roteiro.json': strToU8(JSON.stringify({ idea: job.brief.idea, script: job.script, sources: job.research?.sources || [], checkedAt: job.research?.checkedAt }, null, 2)) };
            for (let i = 0; i < job.brief.count; i++) files[`pagina-${String(i + 1).padStart(2, '0')}.png`] = [await readFile(join(runner.dir(job), `slide-${i}.png`)), { level: 0 }];
            if (['flyer','business-card'].includes(job.brief.format)) files['impressao.pdf'] = [await readFile(join(runner.dir(job),'impressao.pdf')), {level:0}];
            if (job.video) files['video.mp4'] = [await readFile(join(runner.dir(job), 'video.mp4')), { level: 0 }];
            res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="likestudio-${id.slice(0, 8)}.zip"` }); res.end(zipSync(files)); return;
          }
        }
        throw new AppError('Rota não encontrada.', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('Método não permitido.', 405);
      const relative = decodeURIComponent(path === '/' ? '/index.html' : path);
      if (relative.includes('\0') || relative.split('/').some(p => p.startsWith('.'))) throw new AppError('Arquivo não encontrado.', 404);
      const file = resolve(ROOT, 'public', '.' + relative);
      if (!file.startsWith(join(ROOT, 'public') + '/')) throw new AppError('Arquivo não encontrado.', 404);
      await sendFile(req, res, file);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (req.method === 'PUT' && req.url === '/api/settings' && error instanceof AppError && error.code) console.warn(JSON.stringify({ event: 'api_key_connection_failed', code: error.code, status: error.status }));
      json(res, error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : 'Não foi possível concluir a solicitação.', code: error instanceof AppError ? error.code : undefined });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  return { server, store, runner, async close() { runner.stop(); await new Promise(resolve => server.close(resolve)); while (runner.controllers.size) await new Promise(resolve => setTimeout(resolve, 10)); store.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createApp(); const portIndex = process.argv.indexOf('--port'); const port = Number(process.env.PORT || (portIndex >= 0 ? process.argv[portIndex + 1] : 3000));
  app.server.listen(port, '0.0.0.0', () => console.log(`LikeStudio disponível na porta ${port}`));
  for (const event of ['SIGTERM', 'SIGINT']) process.once(event, async () => { await app.close(); process.exit(0); });
}
