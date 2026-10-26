import { AppError, MODELS } from './content.js';
const preferred = {
  text: [MODELS.text, 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  image: [MODELS.image, 'gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'],
  voice: [MODELS.voice, 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'],
  video: [MODELS.video]
};
export function compatible(model, role) {
  const id=model.id;
  if (!/^gemini-[a-z0-9.-]+$/.test(id)) return false;
  if (role==='video') return /omni.*flash/.test(id);
  if (model.methods?.length && !model.methods.includes('generateContent')) return false;
  if (role==='image') return /image|nano-banana/.test(id);
  if (role==='voice') return /tts/.test(id);
  return !/image|nano-banana|tts|live|audio|embedding|robot|omni|transcribe|computer/.test(id) && /flash|pro|argon/.test(id);
}
export function selectModels(available, configured={}, required=[]) {
  const selected={...MODELS,...configured};
  for (const role of Object.keys(MODELS)) {
    const candidates=available.filter(m=>compatible(m,role));
    const current=candidates.find(m=>m.id===selected[role]);
    const choice=current || preferred[role].map(id=>candidates.find(m=>m.id===id)).find(Boolean) || candidates[0];
    if (choice) selected[role]=choice.id;
    else if (required.includes(role)) throw new AppError(`Sua conta não retornou um modelo compatível para ${ {text:'pesquisa e roteiro',image:'geração de imagens',voice:'narração',video:'cenas de vídeo'}[role] }. Confira os modelos disponíveis e o acesso do projeto no Google AI Studio.`,409,'MODEL_UNAVAILABLE');
  }
  return selected;
}
