import test from 'node:test';
import assert from 'node:assert/strict';
import { Gemini } from '../lib/gemini.js';
import { MODELS, validateBrief } from '../lib/content.js';
import { brief, TEST_KEY } from './helpers.js';
const response = content => new Response(JSON.stringify({status:'completed',steps:[{type:'model_output',content}]}),{status:200});
test('adaptador usa Interactions REST e extrai somente os blocos documentados',async()=>{
  let payload,headers;
  const gemini=new Gemini(async(url,options)=>{assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');payload=JSON.parse(options.body);headers=options.headers;return response([{type:'image',mime_type:'image/png',data:Buffer.from('image-bytes').toString('base64')}]);});
  const output=await gemini.image(TEST_KEY,{visual:'a notebook'},validateBrief(brief),{color:'#8b5cf6'},0,MODELS);
  assert.equal(output.toString(),'image-bytes');assert.equal(headers['x-goog-api-key'],TEST_KEY);assert.equal(payload.store,false);assert.deepEqual(payload.response_format,{type:'image',mime_type:'image/png',aspect_ratio:'4:5',image_size:'1K'});
});
test('pesquisa só é aceita com chamada de busca e fontes reais retornadas pela API',async()=>{
  const gemini=new Gemini(async()=>response([{type:'text',text:'Notícia inventada com URL no texto https://example.org'}]));
  await assert.rejects(gemini.research(TEST_KEY,validateBrief(brief),MODELS),/fontes verificáveis/);
});
test('erros do provedor nunca expõem chave ou corpo cru',async()=>{
  const gemini=new Gemini(async()=>new Response(JSON.stringify({error:{message:TEST_KEY}}),{status:403}));
  await assert.rejects(gemini.validateKey(TEST_KEY),e=>!e.message.includes(TEST_KEY)&&e.message.includes('permissão'));
});
test('parâmetros inválidos bloqueados antes de chamadas pagas',()=>{
  assert.throws(()=>validateBrief({...brief,format:'../../admin'}));assert.throws(()=>validateBrief({...brief,count:3.5}));assert.throws(()=>validateBrief({...brief,idea:'curta'}));
});
