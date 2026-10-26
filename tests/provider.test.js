import test from 'node:test';
import assert from 'node:assert/strict';
import { Gemini } from '../lib/gemini.js';
import { MODELS, validateBrief } from '../lib/content.js';
import { brief, TEST_KEY } from './helpers.js';
const response = content => new Response(JSON.stringify({status:'completed',steps:[{type:'model_output',content}]}),{status:200});
test('imagens usam Generate Content REST e leem inlineData',async()=>{
  let payload,headers;
  const gemini=new Gemini(async(url,options)=>{assert.equal(url,`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.image}:generateContent`);payload=JSON.parse(options.body);headers=options.headers;return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.from('image-bytes').toString('base64')}}]},finishReason:'STOP'}]}));});
  const output=await gemini.image(TEST_KEY,{visual:'a notebook'},validateBrief(brief),{color:'#8b5cf6'},0,MODELS);
  assert.equal(output.toString(),'image-bytes');assert.equal(headers['x-goog-api-key'],TEST_KEY);assert.ok(!('store' in payload));assert.deepEqual(payload.generationConfig,{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'4:5'}});
});
test('pesquisa só é aceita com consultas e fontes retornadas pelo Google',async()=>{
  const gemini=new Gemini(async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Notícia inventada com URL https://example.org'}]},finishReason:'STOP'}]})));
  await assert.rejects(gemini.research(TEST_KEY,validateBrief(brief),MODELS),/fontes verificáveis/);
});
test('erros do provedor nunca expõem chave ou corpo cru',async()=>{
  const gemini=new Gemini(async()=>new Response(JSON.stringify({error:{message:TEST_KEY}}),{status:403}));
  await assert.rejects(gemini.validateKey(TEST_KEY),e=>!e.message.includes(TEST_KEY)&&e.message.includes('permissão'));
});
test('parâmetros inválidos bloqueados antes de chamadas pagas',()=>{
  assert.throws(()=>validateBrief({...brief,format:'../../admin'}));assert.throws(()=>validateBrief({...brief,count:3.5}));assert.throws(()=>validateBrief({...brief,idea:'curta'}));
});

test('chaves copiadas com prefixo, aspas e quebras chegam normalizadas ao Google',async()=>{
  const { normalizeApiKey }=await import('../lib/gemini.js');
  const plain='AIzaSy-test-only-key-value-1234567890';
  for(const value of [plain,`  "${plain}"  `,`export GEMINI_API_KEY='${plain}'`,`GOOGLE_API_KEY=“${plain}”`,`x-goog-api-key: ${plain}`,`${plain.slice(0,15)}\n${plain.slice(15)}\u200B`]){
    assert.equal(normalizeApiKey(value),plain);
    const gemini=new Gemini(async(url,options)=>{assert.ok(url.includes('/models?'));assert.equal(options.headers['x-goog-api-key'],plain);return new Response(JSON.stringify({models:[{name:'models/gemini-3.8-flash'}]}));});
    assert.equal((await gemini.validateKey(value)).length,1);
  }
});
test('validação aceita credenciais opacas longas sem exigir o alfabeto antigo',async()=>{
  const longKey='auth.'+'aB9_/+=-'.repeat(50);
  const gemini=new Gemini(async(url,options)=>{assert.equal(options.headers['x-goog-api-key'],longKey);return new Response(JSON.stringify({models:[]}));});
  assert.deepEqual(await gemini.validateKey(longKey),[]);
});
test('chaves inválidas e restritas têm motivos úteis sem expor a resposta do Google',async()=>{
  for(const [status,reason,code] of [[400,'API_KEY_INVALID','KEY_INVALID'],[403,'API_KEY_HTTP_REFERRER_BLOCKED','KEY_REFERRER_BLOCKED'],[403,'SERVICE_DISABLED','KEY_SERVICE_BLOCKED'],[429,'RATE_LIMIT_EXCEEDED','GOOGLE_QUOTA'],[402,'BILLING_DISABLED','GOOGLE_BILLING']]){
    const gemini=new Gemini(async()=>new Response(JSON.stringify({error:{message:`PRIVATE ${TEST_KEY}`,details:[{reason,metadata:{private:TEST_KEY}}]}}),{status}));
    await assert.rejects(gemini.validateKey(TEST_KEY),e=>e.code===code&&!e.message.includes(TEST_KEY)&&!e.message.includes('PRIVATE'));
  }
});
test('chave de outro provedor ou máscara não é enviada ao Google',async()=>{
  let calls=0;const gemini=new Gemini(async()=>{calls++;throw Error('unexpected request');});
  await assert.rejects(gemini.validateKey('sk-proj-test-placeholder-long-enough'),e=>e.code==='KEY_PROVIDER');
  await assert.rejects(gemini.validateKey('••••••••••••••••••••••••'),e=>e.code==='KEY_FORMAT');
  assert.equal(calls,0);
});
