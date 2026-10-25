// Test-only entry point. Production always uses server.js and the real Gemini adapter.
import { createApp } from '../server.js';
import { FakeProvider } from './helpers.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const app=createApp({dataDir:join(tmpdir(),'likestudio-browser-test'),provider:new FakeProvider()});
const i=process.argv.indexOf('--port');
app.server.listen(Number(i>=0?process.argv[i+1]:4173),'0.0.0.0',()=>console.log('LikeStudio TESTE — respostas controladas, sem chamadas pagas.'));
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await app.close();process.exit(0);});
