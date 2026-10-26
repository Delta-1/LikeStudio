import { readFile } from 'node:fs/promises';
import { aspectRatio } from './formats.js';
let referenceImage;
const capisolReference = () => referenceImage ||= readFile(new URL('../public/capisol-reference.jpg', import.meta.url)).then(b=>({inlineData:{mimeType:'image/jpeg',data:b.toString('base64')}}));
import { selectModels } from './models.js';
import { createHash } from 'node:crypto';
import { AppError, MODELS, researchPrompt, scriptPrompt, imagePrompt, videoPrompt, scriptSchema, validateScript } from './content.js';

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
  if (!validating && status === 400 && /billing|paid tier|payment|prepay/i.test(String(error.message || ''))) return new AppError('O Google exige faturamento ativo para este recurso. Confira o faturamento do projeto no Google AI Studio.', 402, 'GOOGLE_BILLING');
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
  constructor(fetcher = globalThis.fetch) { this.fetcher = fetcher; this.modelCache = new Map(); }
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
      const validating = !body && path.startsWith('/models');
      const failure = upstreamError(response.status, data, validating);
      const knownFields = ['response_format','responseJsonSchema','responseMimeType','responseFormat','speechConfig','imageConfig','store'];
      const rejectedField = knownFields.find(f => /unknown|unsupported|not supported|invalid/i.test(String(data?.error?.message || '')) && String(data?.error?.message || '').toLowerCase().includes(f.toLowerCase()));
      if (!validating && response.status === 400 && rejectedField && failure.code === 'GOOGLE_REQUEST_FAILED') failure.code = 'GOOGLE_PARAMETER_UNSUPPORTED';
      const model = body?.model || /^\/models\/(gemini-[a-z0-9.-]+):/.exec(path)?.[1];
      console.warn(JSON.stringify({event:'gemini_request_failed',operation:validating?'models':path==='/interactions'?'interactions':'generateContent',model: /^gemini-[a-z0-9.-]+$/.test(model || '') ? model : undefined,status:response.status,code:failure.code,field:rejectedField}));
      throw failure;
    }
    return limitedResponse(response);
  }
  async validateKey(key) {
    key = normalizeApiKey(key);
    const result = await this.request('/models?pageSize=1000', key, null, null, 20000);
    if (!Array.isArray(result.models)) throw new AppError('Não foi possível validar os modelos desta chave.', 502);
    const models = result.models.filter(m=>typeof m.name==='string').map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name, methods: m.supportedGenerationMethods || [] })).filter(m => m.id.startsWith('gemini-'));
    const hash=createHash('sha256').update(key).digest('hex');
    this.modelCache.set(hash,{at:Date.now(),models});
    if(this.modelCache.size>200) this.modelCache.delete(this.modelCache.keys().next().value);
    return models;
  }
  async interaction(key, body, signal, timeout) {
    const result = await this.request('/interactions', key, { ...body, store: false }, signal, timeout);
    if (result.status && result.status !== 'completed') throw new AppError('A geração não foi concluída pelo provedor. Confira o consumo antes de retomar.', 502);
    return result;
  }
  async resolveModels(key, configured, required, signal) {
    if(signal?.aborted) throw new AppError('Criação cancelada.',409);
    const hash=createHash('sha256').update(key).digest('hex'), cached=this.modelCache.get(hash);
    const available=cached && cached.at>Date.now()-300000 ? cached.models : await this.validateKey(key);
    return selectModels(available,configured,required);
  }
  async generate(key, model, input, config, signal) {
    if(!/^gemini-[a-z0-9.-]+$/.test(model || '')) throw new AppError('Modelo inválido.',400,'MODEL_INVALID');
    const payload={contents:[{role:'user',parts:Array.isArray(input) ? input : [{text:input}]}],...config};
    let result;
    try { result=await this.request(`/models/${model}:generateContent`,key,payload,signal); }
    catch(error) {
      // Only retry a request explicitly rejected for an unsupported schema field.
      // Timeouts, quota, billing, authentication and completed generations never retry.
      if(error.code!=='GOOGLE_PARAMETER_UNSUPPORTED' || !payload.generationConfig?.responseJsonSchema) throw error;
      const {responseMimeType,responseJsonSchema,...rest}=payload.generationConfig;
      payload.generationConfig={...rest,responseFormat:{text:{mimeType:'APPLICATION_JSON',schema:responseJsonSchema}}};
      result=await this.request(`/models/${model}:generateContent`,key,payload,signal);
    }
    if(result.promptFeedback?.blockReason) throw new AppError('O Gemini bloqueou esta pauta. Ajuste o assunto para continuar.',422,'CONTENT_BLOCKED');
    const candidate=result.candidates?.[0];
    if(!candidate?.content?.parts?.length) throw new AppError('O Gemini não retornou conteúdo para esta etapa. Confira o modelo e o acesso do projeto.',502,'EMPTY_GENERATION');
    if(candidate.finishReason && !['STOP','FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) throw new AppError('O Gemini interrompeu a geração antes de concluir. Ajuste a pauta ou reduza a quantidade de páginas.',422,'INCOMPLETE_GENERATION');
    return candidate;
  }
  async research(key, brief, models, signal) {
    const candidate=await this.generate(key,models.text,researchPrompt(brief),{tools:[{google_search:{}}]},signal);
    const summary=candidate.content.parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join('\n');
    const grounding=candidate.groundingMetadata || {};
    const sources=[...new Map((grounding.groundingChunks||[]).filter(c=>/^https?:\/\//.test(c.web?.uri||'')).map(c=>[c.web.uri,{url:c.web.uri,title:String(c.web.title||new URL(c.web.uri).hostname).slice(0,200)}])).values()].slice(0,30);
    if(!summary || !sources.length || !grounding.webSearchQueries?.length) throw new AppError('A pesquisa não retornou fontes verificáveis. Ajuste o assunto ou o período e crie novamente.',502,'RESEARCH_WITHOUT_SOURCES');
    return {summary:summary.slice(0,24000),sources,suggestions:String(grounding.searchEntryPoint?.renderedContent||'').slice(0,100000),checkedAt:new Date().toISOString()};
  }
  async script(key, brief, research, brand, models, signal) {
    const candidate=await this.generate(key,models.text,scriptPrompt(brief,research?.summary,brand),{generationConfig:{responseMimeType:'application/json',responseJsonSchema:scriptSchema}},signal);
    const raw=candidate.content.parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join('');
    let value; try { value=JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')); } catch { throw new AppError('O roteiro retornou em um formato inesperado. Retome a criação.',502,'INVALID_SCRIPT'); }
    return validateScript(value,brief.count);
  }
  async image(key, slide, brief, brand, index, models, signal) {
    const prompt=imagePrompt(slide,brief,brand,index);
    const input=brief.style==='solar'?[{text:prompt},await capisolReference()]:prompt;
    const candidate=await this.generate(key,models.image,input,{generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:aspectRatio(brief)}}},signal);
    const image=candidate.content.parts.find(p=>p.inlineData?.data&&/^image\//.test(p.inlineData.mimeType||''));
    if(!image) throw new AppError('O modelo não retornou uma imagem. Confira o acesso à geração de imagens no seu projeto.',502,'IMAGE_NOT_RETURNED');
    return Buffer.from(image.inlineData.data,'base64');
  }
  async voice(key, transcript, brief, models, signal) {
    const oldVoice=/^gemini-(?:2\.5|3\.1)-/.test(models.voice);
    const voiceConfig=oldVoice?{prebuiltVoiceConfig:{voiceName:brief.voice}}:{voice:brief.voice};
    const candidate=await this.generate(key,models.voice,`Read the following text exactly, with a clear natural educational voice in ${brief.language}:\n${transcript}`,{generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig}}},signal);
    const audio=candidate.content.parts.find(p=>p.inlineData?.data&&/^audio\//i.test(p.inlineData.mimeType||''));
    if(!audio) throw new AppError('O modelo não retornou a narração. Confira o acesso a áudio no projeto.',502,'AUDIO_NOT_RETURNED');
    return audioBuffer(audio.inlineData);
  }
  async video(key, slide, brief, models, signal, brand = {}) {
    const prompt = videoPrompt(slide, brief, brand);
    const result = await this.interaction(key, { model: models.video, input: prompt, response_format: { type: 'video', aspect_ratio: '9:16' } }, signal, 480000);
    const block = outputBlocks(result).find(b => b.type === 'video' && b.data);
    if (!block) throw new AppError('O Gemini não retornou um vídeo. Confira o acesso ao modelo nas configurações.', 502);
    return Buffer.from(block.data, 'base64');
  }
}

export function audioBuffer(audio) {
  const bytes=Buffer.from(audio.data,'base64'), mime=audio.mimeType||'';
  if(/^audio\/(?:wav|x-wav)/i.test(mime)) return bytes;
  if(!/^audio\/(?:L16|pcm)(?:;|$)/i.test(mime)) throw new AppError('Formato de áudio não compatível com a exportação.',502,'AUDIO_FORMAT');
  const rate=Number(/(?:^|;)\s*rate=(\d+)/i.exec(mime)?.[1]||24000),channels=Number(/(?:^|;)\s*channels=(\d+)/i.exec(mime)?.[1]||1);
  if(rate<8000||rate>96000||![1,2].includes(channels)||bytes.length%2) throw new AppError('Áudio PCM inválido.',502,'AUDIO_FORMAT');
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+bytes.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*channels*2,28);header.writeUInt16LE(channels*2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(bytes.length,40);
  return Buffer.concat([header,bytes]);
}
