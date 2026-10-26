import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {Gemini,audioBuffer} from '../lib/gemini.js';
import {selectModels} from '../lib/models.js';
import {MODELS,validateBrief} from '../lib/content.js';
import {createApp} from '../server.js';
import {TEST_KEY,brief,waitFor,FakeProvider} from './helpers.js';
const catalog=[{id:'gemini-2.5-flash',methods:['generateContent']},{id:'gemini-2.5-flash-image',methods:['generateContent']},{id:'gemini-2.5-flash-preview-tts',methods:['generateContent']}];
const candidate=(parts,extra={})=>new Response(JSON.stringify({candidates:[{content:{parts},finishReason:'STOP',...extra}]}));
test('seleção usa o catálogo da conta, preserva escolhas compatíveis e recusa ausência de modalidade',()=>{
  const selected=selectModels(catalog,MODELS,['text','image','voice']);assert.equal(selected.text,'gemini-2.5-flash');assert.equal(selected.image,'gemini-2.5-flash-image');assert.equal(selected.voice,'gemini-2.5-flash-preview-tts');
  assert.throws(()=>selectModels(catalog.filter(m=>!m.id.includes('image')),MODELS,['image']),e=>e.code==='MODEL_UNAVAILABLE');
  assert.equal(selectModels([...catalog,{id:'gemini-3.6-flash',methods:['generateContent']}],{text:'gemini-2.5-flash'}).text,'gemini-2.5-flash');
});
test('schema recusado explicitamente permite apenas uma chamada no formato REST alternativo',async()=>{
  let calls=0;const script=await new FakeProvider().script(TEST_KEY,brief);
  const gemini=new Gemini(async(url,options)=>{
    calls++;const body=JSON.parse(options.body);assert.ok(url.endsWith(':generateContent'));
    if(calls===1){assert.equal(body.generationConfig.responseMimeType,'application/json');return new Response(JSON.stringify({error:{message:'Unknown name "responseJsonSchema" at generation_config. Cannot find field.'}}),{status:400});}
    assert.equal(body.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');assert.ok(body.generationConfig.responseFormat.text.schema.properties.slides);return candidate([{text:JSON.stringify(script)}]);
  });
  const result=await gemini.script(TEST_KEY,validateBrief(brief),null,{color:'#8b5cf6'},MODELS);assert.equal(result.slides.length,3);assert.equal(calls,2);
});
test('cota não repete geração nem troca de modelo silenciosamente',async()=>{
  let calls=0;const gemini=new Gemini(async()=>{calls++;return new Response(JSON.stringify({error:{message:'Quota exceeded'}}),{status:429});});
  await assert.rejects(gemini.script(TEST_KEY,validateBrief(brief),null,{color:'#8b5cf6'},MODELS),e=>e.code==='GOOGLE_QUOTA');assert.equal(calls,1);
});
test('narração PCM vira WAV e aceita configuração das vozes anteriores',async()=>{
  const pcm=Buffer.alloc(4800);
  const gemini=new Gemini(async(url,options)=>{const body=JSON.parse(options.body);assert.deepEqual(body.generationConfig.speechConfig.voiceConfig,{prebuiltVoiceConfig:{voiceName:'Kore'}});return candidate([{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:pcm.toString('base64')}}]);});
  const audio=await gemini.voice(TEST_KEY,'Texto de teste',validateBrief(brief),{voice:'gemini-2.5-flash-preview-tts'});assert.equal(audio.toString('ascii',0,4),'RIFF');assert.equal(audio.readUInt32LE(24),24000);assert.equal(audio.length,pcm.length+44);
});
test('servidor completo usa adaptador real com catálogo e respostas REST controlados até exportar PNG',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'likestudio-wire-')),calls=[];
  const png=await sharp({create:{width:120,height:150,channels:3,background:'#7852a1'}}).png().toBuffer();
  const script=await new FakeProvider().script(TEST_KEY,brief);
  const provider=new Gemini(async(url,options)=>{
    assert.equal(options.headers['x-goog-api-key'],TEST_KEY);
    if(options.method==='GET') return new Response(JSON.stringify({models:catalog.map(m=>({name:'models/'+m.id,supportedGenerationMethods:m.methods}))}));
    const body=JSON.parse(options.body);calls.push(url);assert.ok(!('response_format' in body));
    if(url.includes('flash-image:generateContent')) return candidate([{inlineData:{mimeType:'image/png',data:png.toString('base64')}}]);
    assert.ok(url.includes('gemini-2.5-flash:generateContent'));
    if(body.tools){assert.deepEqual(body.tools,[{google_search:{}}]);return candidate([{text:'Pesquisa de teste'}],{groundingMetadata:{webSearchQueries:['pauta de teste'],groundingChunks:[{web:{uri:'https://example.org/fonte',title:'Fonte'}}],searchEntryPoint:{renderedContent:'<p>Busca</p>'}}});}
    assert.ok(body.generationConfig.responseJsonSchema);return candidate([{text:JSON.stringify(script)}]);
  });
  const app=createApp({dataDir:dir,provider});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const response=await fetch(origin+'/api/session');const cookie=response.headers.get('set-cookie').split(';')[0];await response.json();
  async function request(path,method='GET',body){const r=await fetch(origin+'/api'+path,{method,headers:{cookie,origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
  const connection=await request('/settings','PUT',{apiKey:TEST_KEY});assert.equal(connection.settings.models.text,'gemini-2.5-flash');
  const created=await request('/jobs','POST',brief);const job=await waitFor(()=>request('/jobs/'+created.id));assert.equal(job.status,'completed',job.error);assert.equal(job.models.image,'gemini-2.5-flash-image');assert.equal(job.research.sources[0].url,'https://example.org/fonte');assert.equal(calls.length,5);
  const image=await fetch(`${origin}/api/jobs/${job.id}/files/slide-0.png`,{headers:{cookie}});const meta=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1350);
});
test('retomar uma tarefa antiga resolve modelos ausentes e preserva pesquisa pronta',async t=>{
  const {Store}=await import('../lib/store.js');const {JobRunner}=await import('../lib/jobs.js');
  const dir=await mkdtemp(join(tmpdir(),'likestudio-model-retry-'));const store=new Store(dir);const provider=new FakeProvider();
  provider.resolveModels=async(key,configured,required)=>selectModels(catalog,configured,required);
  store.createWorkspace('workspace');store.settings('workspace',{},TEST_KEY);
  const runner=new JobRunner(store,provider);t.after(async()=>{runner.stop();while(runner.controllers.size) await new Promise(r=>setTimeout(r,10));store.close();await rm(dir,{recursive:true,force:true});});
  store.save({id:'old-model-job',workspace:'workspace',brief:validateBrief(brief),brand:{color:'#8b5cf6'},models:{...MODELS},status:'failed',stage:'Falha no roteiro',progress:8,createdAt:new Date().toISOString(),checkpoints:{images:[],slides:[],voices:[],scenes:[]},research:{summary:'Pesquisa já concluída',sources:[{title:'Fonte',url:'https://example.org/fonte'}],checkedAt:new Date().toISOString()}});
  const job=runner.retry('old-model-job','workspace');const done=await waitFor(()=>store.job(job.id,'workspace'));assert.equal(done.status,'completed',done.error);assert.equal(done.models.text,'gemini-2.5-flash');assert.equal(done.models.image,'gemini-2.5-flash-image');assert.equal(provider.calls.research,0);assert.equal(provider.calls.script,1);
});
