import sharp from 'sharp';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from '../lib/media.js';
export const TEST_KEY = 'test-only-placeholder-api-key-123456';
export const brief = { idea:'Como usar tecnologia para organizar os estudos?', format:'carousel', count:3, style:'editorial', research:true };
export function wave(seconds = .25) {
  const size=Math.floor(seconds*24000)*2, b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(36+size,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;
}
export class FakeProvider {
  constructor() {this.calls={research:0,script:0,image:0,voice:0,video:0};this.failImage=0;this.waitImage=0;}
  async validateKey(key){if(key!==TEST_KEY)throw new Error('Chave inválida de teste.');return [{id:'gemini-3.8-flash',name:'Flash'}];}
  async research(){this.calls.research++;return {summary:'Resumo controlado, usado exclusivamente em testes.',sources:[{title:'Fonte de teste',url:'https://example.org/fonte'}],suggestions:'<p>Busca de teste</p>',checkedAt:new Date().toISOString()};}
  async script(key,b){this.calls.script++;return {title:'Tecnologia para estudar melhor',caption:'Legenda de teste. #estudos',slides:Array.from({length:b.count},(_,i)=>({title:`Ideia ${i+1} para estudar melhor`,body:'Organize seu tempo e acompanhe sua rotina de estudos.',visual:'An abstract purple notebook, no text.',narration:'Organize sua rotina de estudos.'}))};}
  async image(key,s,b,brand,i,models,signal){this.calls.image++;if(this.waitImage)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,this.waitImage);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('cancelled'));},{once:true});});if(this.failImage===this.calls.image)throw new Error('Falha controlada em teste.');return sharp({create:{width:120,height:150,channels:3,background:i%2?'#788c6b':'#6b4b9c'}}).png().toBuffer();}
  async voice(){this.calls.voice++;return wave();}
  async video(){this.calls.video++;const dir=await mkdtemp(join(tmpdir(),'ls-video-'));try{const file=join(dir,'raw.mp4');await command('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i','color=c=purple:s=180x320:d=0.3','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',file]);return await readFile(file);}finally{await rm(dir,{recursive:true,force:true});}}
}
export async function waitFor(get, predicate = j=>['completed','failed','cancelled'].includes(j.status), timeout=30000) {
  const start=Date.now();while(Date.now()-start<timeout){const job=await get();if(predicate(job))return job;await new Promise(r=>setTimeout(r,30));}throw new Error('Tempo de espera excedido no teste.');
}
