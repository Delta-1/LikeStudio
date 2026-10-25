import { AppError, MODELS, researchPrompt, scriptPrompt, imagePrompt, scriptSchema, validateScript } from './content.js';

const ROOT = 'https://generativelanguage.googleapis.com/v1beta';
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
      // Never return raw upstream text: it can contain credentials or private prompts.
      await response.body?.cancel().catch(() => {});
      const message = { 400: 'O Gemini não aceitou esta solicitação. Confira os modelos em Configurações e se sua chave está válida.', 401: 'Chave de API inválida. Atualize em Configurações.', 403: 'A chave não tem permissão para este recurso. Confira o projeto e o faturamento no Google AI Studio.', 404: 'Modelo indisponível para esta chave. Escolha outro em Configurações.', 429: 'Limite de uso ou créditos atingido no Gemini. Confira sua cota antes de retomar.' }[response.status] || 'O serviço Gemini está indisponível. Retome a criação mais tarde.';
      throw new AppError(message, response.status === 429 ? 429 : 502);
    }
    return limitedResponse(response);
  }
  async validateKey(key) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(key)) throw new AppError('Cole uma chave Gemini válida do Google AI Studio.');
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
