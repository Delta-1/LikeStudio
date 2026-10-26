import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import { createApp } from '../server.js';
import { Gemini } from '../lib/gemini.js';
import { validateBrief, MODELS } from '../lib/content.js';
import { dimensions, printSpec } from '../lib/formats.js';
import { FakeProvider, TEST_KEY, waitFor } from './helpers.js';
const data={idea:'Crie uma arte para divulgar a energia solar.',style:'solar',research:false,details:{person:'Maria de Exemplo',role:'Consultora solar',phone:'(00) 00000-0000',email:'contato@example.org',website:'example.org',address:'Endereço de exemplo',cta:'Peça uma avaliação'}};
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'ls-material-')),provider=new FakeProvider(),app=createApp({dataDir:dir,provider});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${app.server.address().port}`;
  const session=await fetch(origin+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0];await session.json();
  const req=(path,method='GET',body)=>fetch(origin+'/api'+path,{method,headers:{cookie,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const json=async(...args)=>{const r=await req(...args),j=await r.json();assert.ok(r.ok,JSON.stringify(j));return j;};await json('/settings','PUT',{apiKey:TEST_KEY});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});return{provider,json,req};
}
for(const format of ['flyer','business-card'])test(`${format}: API → fila → PNG 300 dpi → PDF com TrimBox → ZIP → edição`,async t=>{
  const f=await fixture(t),created=await f.json('/jobs','POST',{...data,format,count:99}),job=await waitFor(()=>f.json('/jobs/'+created.id));assert.equal(job.status,'completed',job.error);assert.equal(job.brief.count,format==='business-card'?2:1);
  const png=await (await f.req(`/jobs/${job.id}/files/slide-0.png`)).arrayBuffer(),m=await sharp(Buffer.from(png)).metadata(),[w,h]=dimensions(format);assert.equal(m.width,w);assert.equal(m.height,h);assert.equal(m.density,300);
  const r=await f.req(`/jobs/${job.id}/files/impressao.pdf?download`);assert.equal(r.headers.get('content-type'),'application/pdf');const pdf=await PDFDocument.load(await r.arrayBuffer());assert.equal(pdf.getPageCount(),job.brief.count);const spec=printSpec(format),trim=pdf.getPage(0).getTrimBox();assert.ok(Math.abs(trim.width-spec.width*72/25.4)<.001);assert.ok(Math.abs(trim.x-3*72/25.4)<.001);
  const zip=unzipSync(new Uint8Array(await (await f.req(`/jobs/${job.id}/download`)).arrayBuffer()));assert.ok(zip['impressao.pdf']);if(format==='business-card')assert.ok(zip['pagina-02.png']);
  const calls={...f.provider.calls};await f.json(`/jobs/${job.id}`,'PATCH',{slides:job.script.slides.map(s=>({title:'Texto revisado',body:s.body}))});assert.deepEqual(f.provider.calls,calls);const edited=Buffer.from(await (await f.req(`/jobs/${job.id}/files/impressao.pdf`)).arrayBuffer());assert.ok(edited.length>1000);
});
test('propaganda: quatro proporções são exportadas com dimensões corretas',async t=>{
  const f=await fixture(t);for(const placement of ['feed','story','square','landscape']){const created=await f.json('/jobs','POST',{...data,format:'ad',placement}),job=await waitFor(()=>f.json('/jobs/'+created.id));assert.equal(job.status,'completed',job.error);const m=await sharp(Buffer.from(await (await f.req(`/jobs/${job.id}/files/slide-0.png`)).arrayBuffer())).metadata();assert.deepEqual([m.width,m.height],dimensions('ad',placement));}
});
test('contatos validados; dados da identidade permanecem opcionais e isolados',async t=>{
  assert.throws(()=>validateBrief({...data,format:'business-card',details:{}}),/Informe telefone/);assert.throws(()=>validateBrief({...data,layout:'arbitrary'}));
  const f=await fixture(t);await f.json('/settings','PUT',{details:data.details});const s=await f.json('/session');assert.equal(s.settings.details.phone,data.details.phone);assert.equal((await f.req('/jobs','POST',{...data,details:{phone:'x'.repeat(41)},format:'flyer'})).status,400);
});
test('Gemini recebe a referência visual real em inlineData para o estilo solar',async()=>{
  let payload;const gemini=new Gemini(async(url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.from('image fixture').toString('base64')}}]}}]}));});
  await gemini.image(TEST_KEY,{visual:'Solar panels on a house'},validateBrief({...data,format:'flyer'}),{name:'CAPISOL'},0,MODELS);
  const parts=payload.contents[0].parts;assert.equal(parts.length,2);assert.equal(parts[1].inlineData.mimeType,'image/jpeg');assert.ok(Buffer.from(parts[1].inlineData.data,'base64').length>10000);assert.ok(parts[0].text.includes('attached CAPISOL board'));assert.equal(payload.generationConfig.imageConfig.aspectRatio,'3:4');
});
