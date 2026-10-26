import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { validateBrief, scriptPrompt, imagePrompt, videoPrompt } from '../lib/content.js';
import { slideSvg } from '../lib/media.js';
import { Store } from '../lib/store.js';
import { JobRunner } from '../lib/jobs.js';
import { FakeProvider, TEST_KEY, waitFor } from './helpers.js';

test('novo conteúdo adota CAPISOL; imagem e vídeo compartilham a direção solar',()=>{
  const b=validateBrief({idea:'Como cuidar dos painéis solares?',purpose:'service'}),brand={name:'CAPISOL',color:'#F6C300'},slide={visual:'A technician inspecting solar panels',narration:'Cuide do seu sistema.'};
  assert.equal(b.style,'solar');assert.equal(b.purpose,'service');
  for(const prompt of [imagePrompt(slide,b,brand,0),videoPrompt(slide,b,brand)]) for(const color of ['#0B2D5B','#F6C300','#E9EEF4']) assert.ok(prompt.includes(color));
  assert.ok(scriptPrompt(b,null,brand).includes('Nunca copie a promessa de 95%'));
  assert.throws(()=>validateBrief({...b,purpose:'invalid'}));
});
test('arte solar alterna capa escura e internas claras e mantém escape dos textos',async()=>{
  const slide={title:'Energia <solar> & economia',body:'Uma ideia por vez.'},brand={name:'CAPISOL',design:'capisol',purpose:'guide'};
  const cover=slideSvg(slide,brand,'carousel',0,3),inner=slideSvg(slide,brand,'carousel',1,3);
  assert.ok(cover.includes('fill="#F6C300"'));assert.ok(cover.includes('&lt;solar&gt; &amp;'));assert.ok(inner.includes('stop-color="#FFFFFF"'));
  for(const format of ['post','reel']) {const m=await sharp(Buffer.from(slideSvg(slide,brand,format,0,1))).metadata();assert.equal(m.width,1080);assert.equal(m.height,format==='reel'?1920:1350);}
});
test('vídeo solar percorre fila, guarda identidade e exporta PNG e MP4 reais',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ls-solar-'));const store=new Store(dir),provider=new FakeProvider(),runner=new JobRunner(store,provider);
  t.after(async()=>{runner.stop();store.close();await rm(dir,{recursive:true,force:true});});
  store.createWorkspace('solar');store.settings('solar',{},TEST_KEY);
  const created=runner.create('solar',{idea:'Explique como funciona a energia solar residencial.',format:'reel',count:1,research:false,purpose:'guide'});
  const job=await waitFor(()=>store.job(created.id,'solar'));assert.equal(job.status,'completed',job.error);assert.equal(job.brand.design,'capisol');assert.equal(job.brand.name,'CAPISOL');assert.equal(job.brand.color,'#F6C300');assert.ok(job.video.duration>0);
  const meta=await sharp(await readFile(join(runner.dir(job),'slide-0.png'))).metadata();assert.equal(meta.height,1920);assert.equal(provider.calls.image,1);assert.equal(provider.calls.voice,1);
});
