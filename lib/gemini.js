import { AppError, MODELS, researchPrompt, scriptPrompt, imagePrompt, scriptSchema, validateScript } from './content.js';

const ROOT = 'https://generativelanguage.googleapis.com/v1beta';
export function normalizeApiKey(input) {
  if (typeof input !== 'string') throw new AppError('Cole a chave copiada do Google AI Studio.', 400, 'KEY_FORMAT');
  let key = input.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
  key = key.replace(/^(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*/i, '').replace(/^x-goog-api-key\s*:\s*/i, '').trim();
  const quotes = { '"': '"', "'": "'", '“': '”', '‘': '’', '`': '`' };
  if (quotes[key[0]] && key.at(-1) === quotes[key[0]]) key = key.slice(1, -1).trim();
  // Credentials are opaque. Do not assume a provider's current alphabet or length.
  // Remove copy/paste line wrapping while rejecting control characters in headers.
  key = key.replace(/[\r\n\t ]/g, '');
  if (/^sk-/i.test(key)) throw new AppError('Essa chave é da OpenAI. Para esta conexão, use uma chave Gemini criada no Google AI Studio.', 400, 'KEY_PROVIDER');
  if (key.length < 20 || key.length > 4096 || /[^\x21-\x7e]|["'`<>]/.test(key)) throw new AppError('Não foi possível reconhecer a chave. No Google AI Studio, use Copiar chave e cole o valor completo, sem asteriscos.', 400, 'KEY_FORMAT');
  return key;
}

function upstreamError(status, data, validating) {
  const error = data?.error || {}, details = Array.isArray(error.details) ? error.details : [];
  const reasons = details.map(d => d.reason).filter(r => typeof r === 'string');
  const has = (...values) => reasons.some(r => values.includes(r));
  if (has('API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_REVOKED', 'API_KEY_NOT_FOUND') || status === 401 || error.code === 'authentication') return new AppError('O Google não reconheceu esta chave ou ela expirou. Copie a chave completa no Google AI Studio e tente novamente.', 400, 'KEY_INVALID');
  if (has('API_KEY_HTTP_REFERRER_BLOCKED')) return new AppError('Esta chave está restrita a chamadas de sites. O LikeStudio faz as chamadas pelo servidor; use uma chave configurada para esse uso no Google AI Studio.', 403, 'KEY_REFERRER_BLOCKED');
  if (has('API_KEY_IP_ADDRESS_BLOCKED', 'API_KEY_ANDROID_APP_BLOCKED', 'API_KEY_IOS_APP_BLOCKED')) return new AppError('As restrições desta chave não permitem chamadas do servidor do LikeStudio. Confira as restrições de aplicativo no projeto Google.', 403, 'KEY_APPLICATION_BLOCKED');
  if (has('SERVICE_DISABLED', 'API_KEY_SERVICE_BLOCKED')) return new AppError('O acesso à API Gemini está desativado ou bloqueado neste projeto. Confira a API Generative Language e as restrições da chave no Google AI Studio.', 403, 'KEY_SERVICE_BLOCKED');
  if (has('BILLING_DISABLED') || status === 402 || error.code === 'payment_required') return new AppError('O Google informou que o faturamento está desativado ou os créditos acabaram. Confira o faturamento do projeto no Google AI Studio.', 402, 'GOOGLE_BILLING');
  if (status === 403) return new AppError('A chave não tem permissão para acessar a API Gemini. Confira o projeto e as permissões no Google AI Studio.', 403, 'KEY_PERMISSION');
  if (status === 429) return new AppError('O Google atingiu o limite de solicitações ou a cota deste projeto. Aguarde e confira a cota no Google AI Studio.', 429, 'GOOGLE_QUOTA');
  if (validating && status === 400) return new AppError('O Google não aceitou esta chave. Copie o valor completo pelo botão Copiar chave do Google AI Studio e tente novamente.', 400, 'KEY_REJECTED');
  return new AppError(status === 404 ? 'Modelo indisponível para esta chave. Escolha outro em Configurações.' : status === 400 ? 'O Gemini não aceitou esta solicitação. Confira os modelos em Configurações.' : 'O serviço Gemini está indisponível. Tente novamente mais tarde.', 502, 'GOOGLE_REQUEST_FAILED');
}
export function outputBlocks(response) {
  return (response.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []);
}
async function limitedResponse(response, limit = 90 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > limit) { await response.body.cancel().catch(() => {}); throw new AppError('O arquivo gerado excedeu o limite de tamanho.', 502); } chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('O provedor retornou uma resposta inválida.', 502); }
}
export class Gemini {
  constructor(fetcher = globalThis.fetch) { this.fetcher = fetcher; }
  async request(path, key, body, signal, timeout = 240000) {
    const timeoutSignal = AbortSignal.timeout(timeout), combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response;
    try { response = await this.fetcher(`${ROOT}${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: combined }); }
    catch (error) {
      if (signal?.aborted) throw new AppError('Criação cancelada.', 409);
      if (timeoutSignal.aborted) throw new AppError('O provedor demorou além do limite. Confira o consumo antes de retomar; uma chamada pode ter sido cobrada.', 504);
      throw new AppError('Não foi possível conectar ao Gemini. Tente novamente mais tarde.', 502);
    }
    if (!response.ok) {
      // Classify only known status/reason values; never echo upstream messages,
      // metadata, API keys, or private prompts into responses or logs.
      const data = await limitedResponse(response, 32768).catch(() => null);
      throw upstreamError(response.status, data, path.startsWith('/models'));
    }
    return limitedResponse(response);
  }
  async validateKey(key) {
    key = normalizeApiKey(key);
    const result = await this.request('/models?pageSize=1000', key, null, null, 20000);
    if (!Array.isArray(result.models)) throw new AppError('Não foi possível validar os modelos desta chave.', 502);
    return result.models.map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name })).filter(m => m.id.startsWith('gemini-'));
  }
  async interaction(key, body, signal, timeout) {
    const result = await this.request('/interactions', key, { ...body, store: false }, signal, timeout);
    if (result.status && result.status !== 'completed') throw new AppError('A geração não foi concluída pelo provedor. Confira o consumo antes de retomar.', 502);
    return result;
  }
  async research(key, brief, models, signal) {
    const result = await this.interaction(key, { model: models.text, input: researchPrompt(brief), tools: [{ type: 'google_search' }] }, signal);
    const blocks = outputBlocks(result), summary = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const citations = blocks.flatMap(b => b.annotations || []).filter(a => a.type === 'url_citation' && /^https?:\/\//.test(a.url || ''));
    const sources = [...new Map(citations.map(c => [c.url, { url: c.url, title: String(c.title || new URL(c.url).hostname).slice(0, 200) }])).values()].slice(0, 30);
    if (!summary || !sources.length || !(result.steps || []).some(s => s.type === 'google_search_call')) throw new AppError('A pesquisa não retornou fontes verificáveis. Ajuste o assunto ou o período e crie novamente.', 502);
    const suggestions = (result.steps || []).filter(s => s.type === 'google_search_result').flatMap(s => s.result || []).map(s => s.search_suggestions || '').join('\n').slice(0, 100000);
    return { summary: summary.slice(0, 24000), sources, suggestions, checkedAt: new Date().toISOString() };
  }
  async script(key, brief, research, brand, models, signal) {
    const result = await this.interaction(key, { model: models.text, input: scriptPrompt(brief, research?.summary, brand), response_format: { type: 'text', mime_type: 'application/json', schema: scriptSchema } }, signal);
    const raw = outputBlocks(result).filter(b => b.type === 'text').map(b => b.text).join('');
    let value; try { value = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { throw new AppError('O roteiro retornou em um formato inesperado. Retome a criação.', 502); }
    return validateScript(value, brief.count);
  }
  async image(key, slide, brief, brand, index, models, signal) {
    const result = await this.interaction(key, { model: models.image, input: imagePrompt(slide, brief, brand, index), response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: brief.format === 'reel' || brief.format === 'story' ? '9:16' : '4:5', image_size: '1K' } }, signal);
    const block = outputBlocks(result).find(b => b.type === 'image' && b.data);
    if (!block) throw new AppError('O Gemini não retornou uma imagem. O tema pode ter sido bloqueado ou o modelo não tem acesso.', 502);
    return Buffer.from(block.data, 'base64');
  }
  async voice(key, transcript, brief, models, signal) {
    const result = await this.interaction(key, { model: models.voice, input: [{ type: 'user_input', content: [{ type: 'text', text: transcript, annotations: [{ type: 'speech_metadata', style: `Clear educational narration, natural pace, language ${brief.language}` }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: brief.voice }] } }, signal);
    const block = outputBlocks(result).find(b => b.type === 'audio' && b.data);
    if (!block || block.mime_type && !/^audio\/(wav|x-wav)/.test(block.mime_type)) throw new AppError('A narração não retornou áudio WAV compatível.', 502);
    return Buffer.from(block.data, 'base64');
  }
  async video(key, slide, brief, models, signal) {
    const prompt = `Create an 8 second vertical educational editorial video illustrating: ${slide.visual}. Art direction: ${brief.style}. Narrator speaks exactly this short sentence in ${brief.language}: ${JSON.stringify(slide.narration)}. No written text or logos. Clearly illustrative imagery, not documentary footage. Consistent refined lighting and smooth camera movement.`;
    const result = await this.interaction(key, { model: models.video, input: prompt, response_format: { type: 'video', aspect_ratio: '9:16' } }, signal, 480000);
    const block = outputBlocks(result).find(b => b.type === 'video' && b.data);
    if (!block) throw new AppError('O Gemini não retornou um vídeo. Confira o acesso ao modelo nas configurações.', 502);
    return Buffer.from(block.data, 'base64');
  }
}
