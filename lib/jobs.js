import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ACTIVE, AppError, MODELS, validateBrief, validateScript } from './content.js';
import { renderSlide, renderScene, normalizeVideo, mergeVideo, slideSvg, captionFile, exportPrint } from './media.js';

const exists = async path => { try { await access(path); return true; } catch { return false; } };
export function publicJob(job, summary = false) {
  const { workspace, ...result } = job;
  if (summary) return { id: job.id, title: job.script?.title || job.brief.idea, status: job.status, stage: job.stage, progress: job.progress, format: job.brief.format, placement: job.brief.placement, style: job.brief.style, count: job.brief.count, createdAt: job.createdAt, updatedAt: job.updatedAt, error: job.error, cover: !!job.checkpoints?.slides?.includes(0), video: !!job.video, reviewed: !!job.reviewed };
  if (result.research) { result.research = { ...result.research }; delete result.research.suggestions; }
  return result;
}
export class JobRunner {
  constructor(store, provider, concurrency = 2) {
    this.store = store; this.provider = provider; this.controllers = new Map(); this.scheduled = false; this.concurrency = concurrency; this.stopped = false;
    for (const job of store.allJobs()) if (ACTIVE.includes(job.status)) { job.status = 'interrupted'; job.stage = 'Criação interrompida'; job.error = 'O servidor foi reiniciado. As etapas salvas foram preservadas. Confira o consumo antes de retomar.'; store.save(job); }
  }
  dir(job) { return join(this.store.dir, 'media', job.id); }
  get(id, workspace) { const job = this.store.job(id, workspace); if (!job) throw new AppError('Conteúdo não encontrado.', 404); return job; }
  create(workspace, input) {
    const ws = this.store.workspace(workspace);
    if (!ws.connected) throw new AppError('Conecte sua chave Gemini para começar.', 409);
    if (this.store.jobs(workspace).filter(j => ACTIVE.includes(j.status)).length >= 2) throw new AppError('Você já tem duas criações em andamento. Aguarde uma finalizar.', 429);
    if (this.store.jobs(workspace).length >= 200) throw new AppError('Sua galeria chegou a 200 conteúdos. Exclua os que não precisa para liberar espaço.', 409);
    const brief = validateBrief(input), now = new Date().toISOString();
    const job = { id: randomUUID(), workspace, brief, brand: { name: ws.settings.name || (brief.style === 'solar' ? 'CAPISOL' : ''), handle: ws.settings.handle, color: brief.style === 'solar' ? '#F6C300' : ws.settings.color, ...(brief.style === 'solar' ? { design: 'capisol', designVersion: 2, purpose: brief.purpose } : {}) , layout: brief.layout, placement: brief.placement, details: brief.details }, models: { ...MODELS, ...ws.settings.models }, status: 'queued', stage: 'Na fila', progress: 0, createdAt: now, updatedAt: now, checkpoints: { images: [], slides: [], voices: [], scenes: [] }, reviewed: false };
    this.store.save(job); this.kick(); return job;
  }
  kick() {
    if (this.scheduled || this.stopped) return;
    this.scheduled = true;
    setImmediate(() => { this.scheduled = false; this.pump(); });
  }
  pump() {
    if (this.stopped) return;
    const queue = this.store.allJobs().filter(j => j.status === 'queued' && !this.controllers.has(j.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    while (this.controllers.size < this.concurrency && queue.length) {
      const job = queue.shift(), controller = new AbortController(); this.controllers.set(job.id, controller);
      this.run(job, controller.signal).catch(() => {}).finally(() => { this.controllers.delete(job.id); this.kick(); });
    }
  }
  update(job, status, stage, progress) { job.status = status; job.stage = stage; job.progress = progress; this.store.save(job); }
  check(signal) { if (signal.aborted) throw new AppError('Criação cancelada.', 409); }
  async run(job, signal) {
    const dir = this.dir(job), b = job.brief, cp = job.checkpoints;
    try {
      const key = this.store.apiKey(job.workspace);
      if (!key) throw new AppError('A chave foi desconectada. Conecte uma chave e retome.');
      if (this.provider.resolveModels) {
        this.update(job, 'queued', 'Conferindo modelos disponíveis', job.progress);
        const required=[];
        if (!job.script || b.research && !job.research) required.push('text');
        if (cp.images.length < b.count) required.push(b.format === 'reel' && b.videoMode === 'generated' ? 'video' : 'image');
        if (b.format === 'reel' && b.videoMode === 'narrated' && cp.voices.length < b.count) required.push('voice');
        job.models = await this.provider.resolveModels(key, job.models, required, signal);
        this.check(signal);
        this.store.settings(job.workspace, { models: job.models });
        this.store.save(job);
      }
      await mkdir(dir, { recursive: true }); this.check(signal);
      if (b.research && !job.research) { this.update(job, 'researching', 'Pesquisando notícias e fontes', 8); job.research = await this.provider.research(key, b, job.models, signal); this.store.save(job); }
      this.check(signal);
      if (!job.script) { this.update(job, 'writing', 'Preparando o roteiro', 20); job.script = await this.provider.script(key, b, job.research, job.brand, job.models, signal); this.store.save(job); }
      for (let i = 0; i < b.count; i++) {
        this.check(signal); const slide = job.script.slides[i];
        if (b.format === 'reel' && b.videoMode === 'generated') {
          if (!cp.images.includes(i) || !await exists(join(dir, `raw-${i}.mp4`))) {
            this.update(job, 'imaging', `Gerando cena ${i + 1} de ${b.count}`, 25 + Math.round(i / b.count * 55));
            const video = await this.provider.video(key, slide, b, job.models, signal, job.brand); await writeFile(join(dir, `raw-${i}.mp4`), video);
            cp.images = [...new Set([...cp.images, i])]; this.store.save(job);
          }
          if (!cp.slides.includes(i) || !await exists(join(dir, `slide-${i}.png`))) {
            const { command } = await import('./media.js');
            await command('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, `raw-${i}.mp4`), '-frames:v', '1', join(dir, `bg-${i}.png`)], signal);
            await renderSlide(join(dir, `bg-${i}.png`), join(dir, `slide-${i}.png`), slide, job.brand, b.format, i, b.count);
            cp.slides = [...new Set([...cp.slides, i])]; this.store.save(job);
          }
        } else {
          if (!cp.images.includes(i) || !await exists(join(dir, `bg-${i}.png`))) {
            this.update(job, 'imaging', `Criando imagem ${i + 1} de ${b.count}`, 25 + Math.round(i / b.count * 50));
            const image = await this.provider.image(key, slide, b, job.brand, i, job.models, signal);
            await sharp(image).rotate().png().toFile(join(dir, `bg-${i}.png`)); cp.images = [...new Set([...cp.images, i])]; this.store.save(job);
          }
          if (!cp.slides.includes(i) || !await exists(join(dir, `slide-${i}.png`))) {
            await renderSlide(join(dir, `bg-${i}.png`), join(dir, `slide-${i}.png`), slide, job.brand, b.format, i, b.count);
            cp.slides = [...new Set([...cp.slides, i])]; this.store.save(job);
          }
        }
        if (b.format === 'reel') {
          if (b.videoMode === 'narrated' && (!cp.voices.includes(i) || !await exists(join(dir, `voice-${i}.wav`)))) {
            this.update(job, 'narrating', `Narrando cena ${i + 1} de ${b.count}`, 30 + Math.round(i / b.count * 50));
            await writeFile(join(dir, `voice-${i}.wav`), await this.provider.voice(key, slide.narration, b, job.models, signal));
            cp.voices = [...new Set([...cp.voices, i])]; this.store.save(job);
          }
          if (!cp.scenes.includes(i) || !await exists(join(dir, `scene-${i}.mp4`))) {
            this.update(job, 'rendering', `Montando cena ${i + 1} de ${b.count}`, 35 + Math.round(i / b.count * 50));
            if (b.videoMode === 'narrated') await renderScene(dir, i, signal);
            else {
              const overlay = join(dir, `overlay-${i}.png`); await sharp(Buffer.from(slideSvg(slide, job.brand, b.format, i, b.count, true))).png().toFile(overlay);
              await normalizeVideo(dir, i, signal, overlay);
            }
            cp.scenes = [...new Set([...cp.scenes, i])]; this.store.save(job);
          }
        }
      }
      this.check(signal); this.update(job, 'rendering', 'Finalizando arquivos', 94);
      if (b.format === 'reel') job.video = { duration: await mergeVideo(dir, b.count, signal) };
      await exportPrint(dir, job); await captionFile(dir, job); this.check(signal);
      delete job.error; delete job.failure; this.update(job, 'completed', 'Pronto para revisar', 100);
    } catch (error) {
      const current = this.store.job(job.id, job.workspace);
      if (!current) return;
      job.failure = { stage: job.status, code: error instanceof AppError ? error.code : undefined };
      if (!signal.aborted) console.warn(JSON.stringify({ event:'generation_failed', stage:job.status, code:error instanceof AppError ? error.code || 'GENERATION_ERROR' : 'INTERNAL_GENERATION_ERROR' }));
      job.status = signal.aborted ? 'cancelled' : 'failed'; job.stage = signal.aborted ? 'Cancelado' : 'Precisa de atenção';
      job.error = signal.aborted ? 'Criação cancelada. Etapas já concluídas foram preservadas; chamadas enviadas ao provedor podem ser cobradas.' : error instanceof AppError ? error.message : 'Não foi possível concluir esta criação. As etapas salvas foram preservadas.';
      this.store.save(job);
    }
  }
  cancel(id, workspace) {
    const job = this.get(id, workspace);
    if (!ACTIVE.includes(job.status)) throw new AppError('Esta criação não está em andamento.', 409);
    const controller = this.controllers.get(id);
    if (controller) controller.abort();
    else { job.status = 'cancelled'; job.stage = 'Cancelado'; job.error = 'Criação cancelada antes do processamento.'; this.store.save(job); }
    return job;
  }
  retry(id, workspace) {
    const job = this.get(id, workspace);
    if (!['failed', 'interrupted', 'cancelled'].includes(job.status) || this.controllers.has(id)) throw new AppError('Aguarde a criação encerrar antes de retomar.', 409);
    if (!this.store.workspace(workspace).connected) throw new AppError('Conecte sua chave para retomar.', 409);
    if (this.store.jobs(workspace).filter(j => ACTIVE.includes(j.status)).length >= 2) throw new AppError('Aguarde uma criação finalizar.', 429);
    job.models = { ...MODELS, ...this.store.workspace(workspace).settings.models }; delete job.error;
    this.update(job, 'queued', 'Retomando etapas pendentes', job.progress); this.kick(); return job;
  }
  async edit(id, workspace, input) {
    const job = this.get(id, workspace);
    if (job.status !== 'completed' || this.controllers.has(id)) throw new AppError('Aguarde a criação finalizar para editar.', 409);
    // Serialize edits and prevent deletion while writing exported assets.
    this.controllers.set(id, new AbortController());
    try {
      const script = validateScript({ ...job.script, caption: input.caption ?? job.script.caption, slides: job.script.slides.map((s, i) => ({ ...s, ...(input.slides?.[i] ? { title: input.slides[i].title, body: input.slides[i].body } : {}) })) }, job.brief.count);
      const dir = this.dir(job);
      for (let i = 0; i < script.slides.length; i++) if (script.slides[i].title !== job.script.slides[i].title || script.slides[i].body !== job.script.slides[i].body) {
        await renderSlide(join(dir, `bg-${i}.png`), join(dir, `slide-${i}.png`), script.slides[i], job.brand, job.brief.format, i, job.brief.count);
        if (job.brief.format === 'reel') {
          if (job.brief.videoMode === 'narrated') await renderScene(dir, i);
          else { const overlay = join(dir, `overlay-${i}.png`); await sharp(Buffer.from(slideSvg(script.slides[i], job.brand, job.brief.format, i, job.brief.count, true))).png().toFile(overlay); await normalizeVideo(dir, i, undefined, overlay); }
        }
      }
      if (job.brief.format === 'reel' && input.slides) job.video = { duration: await mergeVideo(dir, job.brief.count) };
      job.script = script; job.reviewed = input.reviewed === true; await exportPrint(dir, job); this.store.save(job); await captionFile(dir, job); return job;
    } finally { this.controllers.delete(id); this.kick(); }
  }
  async remove(id, workspace) {
    const job = this.get(id, workspace);
    if (ACTIVE.includes(job.status) || this.controllers.has(id)) throw new AppError('Cancele e aguarde a criação encerrar antes de excluir.', 409);
    await rm(this.dir(job), { recursive: true, force: true }); this.store.delete(id, workspace);
  }
  stop() { this.stopped = true; for (const controller of this.controllers.values()) controller.abort(); }
}
