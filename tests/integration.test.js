import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { unzipSync, strFromU8 } from 'fflate';
import { createApp } from '../server.js';
import { FakeProvider, TEST_KEY, brief, waitFor } from './helpers.js';

async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'likestudio-test-')),provider=new FakeProvider(),app=createApp({dataDir:dir,provider});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r)); const origin=`http://127.0.0.1:${app.server.address().port}`;
  const first=await fetch(origin+'/api/session');const cookie=first.headers.get('set-cookie').split(';')[0];await first.json();
  async function req(path,method='GET',data,selected=cookie) {return fetch(origin+'/api'+path,{method,headers:{cookie:selected,origin,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});}
  async function json(path,method='GET',data){const response=await req(path,method,data);const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;}
  await json('/settings','PUT',{apiKey:TEST_KEY,name:'Meu estúdio',handle:'@meuestudio',color:'#8b5cf6'});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  return {app,dir,provider,origin,cookie,req,json};
}
test('BYOK: chave cifrada, sessão isolada e origem validada',async t=>{
  const f=await fixture(t), session=await f.json('/session');
  assert.equal(session.connected,true);assert.ok(!JSON.stringify(session).includes(TEST_KEY));assert.ok(!('id' in session));
  const db=await readFile(join(f.dir,'studio.sqlite-wal'));assert.ok(!db.includes(Buffer.from(TEST_KEY)));
  const csrf=await fetch(f.origin+'/api/settings',{method:'PUT',headers:{cookie:f.cookie,origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
  const job=await f.json('/jobs','POST',brief);
  const foreign=await f.req('/jobs/'+job.id,'GET',undefined,'');assert.equal(foreign.status,404);
  const disconnected=await fetch(f.origin+'/api/session');assert.equal((await disconnected.json()).connected,false);
  assert.equal((await f.req('/jobs','POST',{...brief,count:100})).status,400);
});
test('carrossel completo, fontes no ZIP, edição sem nova geração e arquivos PNG corretos',async t=>{
  const f=await fixture(t),created=await f.json('/jobs','POST',brief);
  const job=await waitFor(()=>f.json('/jobs/'+created.id));assert.equal(job.status,'completed',job.error);
  assert.equal(f.provider.calls.image,3);assert.equal(f.provider.calls.research,1);
  const image=await f.req(`/jobs/${job.id}/files/slide-0.png`),buffer=Buffer.from(await image.arrayBuffer());const metadata=await sharp(buffer).metadata();assert.equal(metadata.width,1080);assert.equal(metadata.height,1350);
  const zip=unzipSync(new Uint8Array(await (await f.req('/jobs/'+job.id+'/download')).arrayBuffer()));assert.ok(zip['pagina-03.png']);assert.ok(strFromU8(zip['legenda.txt']).includes('https://example.org/fonte'));assert.ok(!strFromU8(zip['roteiro.json']).includes(TEST_KEY));
  const edited=await f.json('/jobs/'+job.id,'PATCH',{slides:job.script.slides.map((s,i)=>({title:i?'Página revisada':'Título com acentuação: inovação',body:s.body})),caption:'Legenda revisada.',reviewed:true});
  assert.equal(edited.reviewed,true);assert.equal(f.provider.calls.image,3);assert.equal(edited.script.caption,'Legenda revisada.');
  assert.ok(!buffer.equals(Buffer.from(await (await f.req(`/jobs/${job.id}/files/slide-0.png`)).arrayBuffer())));
  assert.equal((await f.req(`/jobs/${job.id}/files/../../encryption.key`)).status,404);
  assert.equal((await f.req(`/jobs/${job.id}/files/bg-0.png`)).status,404);
  await f.json('/jobs/'+job.id,'DELETE');assert.equal((await f.req('/jobs/'+job.id)).status,404);
});
test('retomada reaproveita pesquisa, roteiro e imagem já concluídos',async t=>{
  const f=await fixture(t);f.provider.failImage=2;const created=await f.json('/jobs','POST',brief);
  let job=await waitFor(()=>f.json('/jobs/'+created.id));assert.equal(job.status,'failed');assert.deepEqual(job.checkpoints.images,[0]);
  await f.json('/jobs/'+job.id+'/retry','POST');job=await waitFor(()=>f.json('/jobs/'+job.id));assert.equal(job.status,'completed',job.error);
  assert.equal(f.provider.calls.research,1);assert.equal(f.provider.calls.script,1);assert.equal(f.provider.calls.image,4);
});
test('cancelamento para a fila e desconectar mantém a galeria',async t=>{
  const f=await fixture(t);f.provider.waitImage=1000;const created=await f.json('/jobs','POST',{...brief,research:false});
  await waitFor(()=>f.json('/jobs/'+created.id),j=>j.status==='imaging');await f.json('/jobs/'+created.id+'/cancel','POST');
  const job=await waitFor(()=>f.json('/jobs/'+created.id));assert.equal(job.status,'cancelled');assert.equal(f.provider.calls.research,0);
  await f.json('/settings/key','DELETE');assert.equal((await f.json('/session')).connected,false);assert.equal((await f.json('/jobs')).jobs.length,1);
});
test('vídeo narrado: WAV real → cenas → MP4, download parcial e texto atualizado',async t=>{
  const f=await fixture(t),created=await f.json('/jobs','POST',{...brief,format:'reel',count:2,research:false});
  const job=await waitFor(()=>f.json('/jobs/'+created.id));assert.equal(job.status,'completed',job.error);assert.equal(f.provider.calls.voice,2);assert.ok(job.video.duration>0);
  const response=await fetch(`${f.origin}/api/jobs/${job.id}/files/video.mp4`,{headers:{cookie:f.cookie,Range:'bytes=0-99'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,100);
  const oldCalls={...f.provider.calls};await f.json('/jobs/'+job.id,'PATCH',{slides:job.script.slides.map(s=>({title:'Novo texto do vídeo',body:s.body}))});assert.deepEqual(f.provider.calls,oldCalls);
  const zip=unzipSync(new Uint8Array(await (await f.req('/jobs/'+job.id+'/download')).arrayBuffer()));assert.ok(zip['video.mp4']);
});
test('vídeo com cenas geradas: composição de textos e exportação MP4',async t=>{
  const f=await fixture(t),created=await f.json('/jobs','POST',{...brief,format:'reel',count:1,research:false,videoMode:'generated'});
  const job=await waitFor(()=>f.json('/jobs/'+created.id));assert.equal(job.status,'completed',job.error);assert.equal(f.provider.calls.video,1);assert.equal(f.provider.calls.image,0);assert.ok(job.video.duration>0);
});
test('persistência conserva chave e conteúdo após reabrir banco; fila interrompida não chama API',async t=>{
  const { Store }=await import('../lib/store.js');const { JobRunner }=await import('../lib/jobs.js');
  const directory=await mkdtemp(join(tmpdir(),'likestudio-restart-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  let store=new Store(directory);store.createWorkspace('workspace-test');store.settings('workspace-test',{},TEST_KEY);
  store.save({id:'job-test',workspace:'workspace-test',status:'imaging',stage:'Gerando',progress:30,createdAt:new Date().toISOString(),checkpoints:{images:[0]},brief});store.close();
  store=new Store(directory);const provider=new FakeProvider();const runner=new JobRunner(store,provider);
  assert.equal(store.apiKey('workspace-test'),TEST_KEY);assert.equal(store.job('job-test','workspace-test').status,'interrupted');assert.deepEqual(store.job('job-test','workspace-test').checkpoints.images,[0]);assert.equal(provider.calls.image,0);runner.stop();store.close();
});
