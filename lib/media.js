import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { writeFile, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from './content.js';
import { dimensions, printSpec } from './formats.js';
import { posterSvg } from './design.js';
import { PDFDocument } from 'pdf-lib';
export { dimensions } from './formats.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
function wrap(s, length) {
  const lines = []; let line = '';
  for (const word of String(s).split(/\s+/)) {
    if ((line + ' ' + word).trim().length > length && line) { lines.push(line); line = ''; }
    // Break unspaced words to prevent overflow in exported media.
    const parts = word.match(new RegExp(`.{1,${length}}`, 'gu')) || [''];
    for (let i = 0; i < parts.length; i++) { if (i) { lines.push(line); line = ''; } line = (line + ' ' + parts[i]).trim(); }
  }
  if (line) lines.push(line);
  return lines;
}
export function slideSvg(slide, brand, format, index, total, generated = false) {
  if (brand.designVersion === 2 || ['flyer','business-card','ad'].includes(format)) return posterSvg(slide,brand,format,index,total);
  if (brand.design === 'capisol') return solarSvg(slide, brand, format, index, total);
  const [w, h] = dimensions(format), color = /^#[a-f\d]{6}$/i.test(brand.color) ? brand.color : '#8b5cf6';
  const size = slide.title.length > 75 ? 60 : 76, bodySize = slide.body.length > 190 ? 32 : 37;
  const titleLine = size + 10, bodyLine = bodySize + 8;
  const titles = wrap(slide.title, size === 60 ? 25 : 21), bodies = wrap(slide.body, bodySize === 32 ? 45 : 39);
  const bodyY = h - 230 - (bodies.length - 1) * bodyLine;
  const titleY = Math.max(220, bodyY - 80 - (titles.length - 1) * titleLine);
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#080811" stop-opacity=".06"/><stop offset=".36" stop-color="#080811" stop-opacity=".5"/><stop offset=".65" stop-color="#080811" stop-opacity=".96"/><stop offset="1" stop-color="#080811"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#shade)"/><rect x="68" y="74" width="46" height="7" rx="3" fill="${color}"/><text x="132" y="88" fill="white" font-family="DejaVu Sans, sans-serif" font-size="25" font-weight="bold">${esc((brand.name || 'LIKESTUDIO').toUpperCase())}</text><text x="68" y="${titleY}" fill="white" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="bold">${titles.map((t, i) => `<tspan x="68" dy="${i ? titleLine : 0}">${esc(t)}</tspan>`).join('')}</text><text x="72" y="${bodyY}" fill="#e6e4f1" font-family="DejaVu Sans, sans-serif" font-size="${bodySize}">${bodies.map((t, i) => `<tspan x="72" dy="${i ? bodyLine : 0}">${esc(t)}</tspan>`).join('')}</text><path d="M72 ${h - 145}H1008" stroke="#ffffff33"/><text x="72" y="${h - 94}" fill="#d2cde3" font-family="DejaVu Sans, sans-serif" font-size="24">${esc(brand.handle || 'Conteúdo para compartilhar')}</text><text x="1008" y="${h - 94}" text-anchor="end" fill="white" font-family="DejaVu Sans, sans-serif" font-size="25">${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</text><text x="72" y="${h - 42}" fill="#aaa4b7" font-family="DejaVu Sans, sans-serif" font-size="17">${generated ? 'Visual ilustrativo gerado por IA' : 'Ilustração gerada por IA'} · Revise as informações antes de publicar</text></svg>`;
}
function solarSvg(slide, brand, format, index, total) {
  const [w,h] = dimensions(format), vertical = h === 1920;
  const navy = '#0B2D5B', yellow = '#F6C300', pale = '#E9EEF4';
  const light = index > 0 && total > 1 || total === 1 && ['institutional','economy'].includes(brand.purpose);
  const ink = light ? navy : '#FFFFFF', font = 'Montserrat, DejaVu Sans, sans-serif';
  const size = slide.title.length > 75 ? 60 : 72, line = size + 9;
  const titles = wrap(slide.title, size === 60 ? 26 : 23), bodies = wrap(slide.body, 43);
  const titleY = vertical ? 480 : 350, bodyY = titleY + (titles.length - 1) * line + 82;
  const bodyEnd = bodyY + (bodies.length - 1) * 42;
  const clearEnd = Math.min(h - 270, Math.max(vertical ? 1000 : 680, bodyEnd + 60));
  const label = ({institutional:'ENERGIA QUE FACILITA',service:'CUIDADO COM SEU SISTEMA',economy:'ECONOMIA E ENERGIA',guide:'GUIA SOLAR',promotion:'NOVIDADES',quote:'VAMOS CONVERSAR',testimonial:'HISTÓRIAS E RESULTADOS'})[brand.purpose] || 'ENERGIA SOLAR';
  const last = index === total - 1;
  const cta = last ? (['quote','service','promotion'].includes(brand.purpose) ? 'Fale com nossa equipe' : 'Salve para consultar') : 'Continue para descobrir';
  const footerY = h - (vertical ? 250 : 120), buttonY = footerY - 124;
  const name = brand.name || 'CAPISOL', brandSize = name.length > 30 ? 24 : 32;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs>
  <linearGradient id="solarShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light ? '#FFFFFF' : navy}" stop-opacity="1"/><stop offset="${Math.min(.78,clearEnd/h).toFixed(3)}" stop-color="${light ? '#FFFFFF' : navy}" stop-opacity="${light ? '.98' : '.92'}"/><stop offset=".88" stop-color="${light ? '#FFFFFF' : navy}" stop-opacity=".05"/><stop offset="1" stop-color="${navy}" stop-opacity=".4"/></linearGradient>
  <linearGradient id="solarSide"><stop stop-color="${navy}" stop-opacity=".25"/><stop offset="1" stop-color="${navy}" stop-opacity="0"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#solarShade)"/>
  ${!light ? `<rect width="${w}" height="${h}" fill="url(#solarSide)"/>` : ''}
  <path d="M870 0H1080V210Q920 175 870 0" fill="${yellow}"/>
  <path d="M0 ${h-300}Q80 ${h-80} 330 ${h}H0Z" fill="${yellow}"/>
  <path d="M72 136Q127 44 204 114" fill="none" stroke="${yellow}" stroke-width="10"/>
  <text x="72" y="179" fill="${ink}" font-family="${font}" font-weight="bold" font-size="${brandSize}" letter-spacing="1">${esc(name.toUpperCase())}</text>
  ${name.toUpperCase() === 'CAPISOL' ? `<text x="74" y="205" fill="${ink}" font-family="${font}" font-size="15" letter-spacing="5">ENERGIA SOLAR</text>` : ''}
  <rect x="72" y="${titleY-100}" width="${Math.min(700,label.length*14+42)}" height="38" rx="19" fill="${light ? pale : navy}" stroke="${light ? navy : '#FFFFFF66'}"/>
  <text x="93" y="${titleY-74}" fill="${ink}" font-family="${font}" font-size="19" font-weight="bold" letter-spacing="1">${label}</text>
  <text font-family="${font}" font-weight="bold" font-size="${size}" fill="${ink}">${titles.map((t,i)=>`<tspan x="72" y="${titleY+i*line}"${i === titles.length-1 && !light ? ` fill="${yellow}"` : ''}>${esc(t)}</tspan>`).join('')}</text>
  <rect x="74" y="${bodyY-44}" width="56" height="5" rx="2" fill="${yellow}"/>
  <text font-family="${font}" font-size="33" fill="${light ? navy : '#E9EEF4'}">${bodies.map((t,i)=>`<tspan x="74" y="${bodyY+i*42}">${esc(t)}</tspan>`).join('')}</text>
  ${light && !last ? '' : `<rect x="72" y="${buttonY}" width="710" height="75" rx="37" fill="${yellow}"/><text x="106" y="${buttonY+47}" fill="${navy}" font-family="${font}" font-weight="bold" font-size="25">${cta}</text><circle cx="739" cy="${buttonY+37}" r="25" fill="${navy}"/><path d="M728 ${buttonY+37}h21m-8-8 8 8-8 8" fill="none" stroke="white" stroke-width="3"/>`}
  <rect x="0" y="${footerY-15}" width="${w}" height="${h-footerY+15}" fill="${light ? '#FFFFFF' : navy}"/>
  <text x="72" y="${footerY+33}" fill="${light ? navy : '#FFFFFF'}" font-family="${font}" font-size="23">${esc((brand.handle || 'Energia que não limita, facilita.').slice(0,44))}</text>
  <text x="1008" y="${footerY+33}" text-anchor="end" fill="${light ? navy : yellow}" font-family="${font}" font-size="25" font-weight="bold">${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}</text>
  <text x="72" y="${footerY+77}" fill="${light ? '#4A607B' : '#BDCDE0'}" font-family="${font}" font-size="17">Visual ilustrativo gerado por IA · Revise antes de publicar</text>
  </svg>`;
}

export async function renderSlide(background, destination, slide, brand, format, index, total) {
  const [width, height] = dimensions(format, brand.placement);
  const overlay = Buffer.from(slideSvg(slide, brand, format, index, total));
  const target = destination + '.tmp';
  await sharp(background).resize(width, height, { fit: 'cover' }).composite([{ input: overlay }]).withMetadata({density: printSpec(format)?.dpi || 72}).png().toFile(target);
  await rename(target, destination);
}
export function command(program, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { signal, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
    child.stdout.on('data', d => { out = (out + d).slice(-30000); }); child.stderr.on('data', d => { err = (err + d).slice(-5000); });
    child.on('error', e => reject(e.code === 'ENOENT' ? new AppError('O servidor precisa de FFmpeg para exportar vídeos.', 503) : e));
    child.on('close', code => code === 0 ? resolve(out) : reject(new AppError(`Não foi possível montar o vídeo${signal?.aborted ? ': criação cancelada' : '. Retome a exportação'}.`, 502)));
  });
}
export async function duration(path, signal) {
  const result = await command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], signal);
  const seconds = Number(result.trim());
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 180) throw new AppError('Duração de mídia inválida.', 502);
  return seconds;
}
export async function renderScene(dir, index, signal) {
  await duration(join(dir, `voice-${index}.wav`), signal);
  await command('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-i', join(dir, `slide-${index}.png`), '-i', join(dir, `voice-${index}.wav`), '-vf', "scale=720:1280,zoompan=z='min(zoom+0.0002,1.05)':d=1:s=720x1280:fps=25", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', join(dir, `scene-${index}.mp4`)], signal);
}
export async function normalizeVideo(dir, index, signal, overlay) {
  const args = ['-y', '-loglevel', 'error', '-i', join(dir, `raw-${index}.mp4`)];
  if (overlay) args.push('-i', overlay);
  args.push(...(overlay ? ['-filter_complex', '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280[v];[1:v]scale=720:1280[o];[v][o]overlay=0:0'] : ['-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280']), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-r', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', join(dir, `scene-${index}.mp4`));
  await command('ffmpeg', args, signal);
}
export async function mergeVideo(dir, count, signal) {
  await writeFile(join(dir, 'scenes.txt'), Array.from({ length: count }, (_, i) => `file 'scene-${i}.mp4'`).join('\n'));
  await command('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'scenes.txt'), '-c', 'copy', '-movflags', '+faststart', join(dir, 'video.tmp.mp4')], signal);
  await rename(join(dir, 'video.tmp.mp4'), join(dir, 'video.mp4'));
  return duration(join(dir, 'video.mp4'), signal);
}
export async function captionFile(dir, job) {
  const sources = (job.research?.sources || []).map(s => `${s.title}\n${s.url}`).join('\n\n');
  await writeFile(join(dir, 'legenda.txt'), `${job.script.caption}\n\n${sources ? `Fontes consultadas em ${job.research.checkedAt}:\n${sources}` : 'Conteúdo sem pesquisa na web.'}\n\nVisuais ilustrativos gerados por IA. Revise antes de publicar.\n`);
}

export async function exportPrint(dir, job) {
  const spec=printSpec(job.brief.format);if(!spec)return;
  const pdf=await PDFDocument.create(), mm=72/25.4;
  pdf.setTitle(job.script.title);pdf.setCreator('LikeStudio');
  for(let i=0;i<job.brief.count;i++){
    const png=await pdf.embedPng(await readFile(join(dir,`slide-${i}.png`)));
    const w=(spec.width+spec.bleed*2)*mm,h=(spec.height+spec.bleed*2)*mm,page=pdf.addPage([w,h]);
    page.drawImage(png,{x:0,y:0,width:w,height:h});
    page.setTrimBox(spec.bleed*mm,spec.bleed*mm,spec.width*mm,spec.height*mm);page.setBleedBox(0,0,w,h);
  }
  await writeFile(join(dir,'impressao.tmp.pdf'),await pdf.save());await rename(join(dir,'impressao.tmp.pdf'),join(dir,'impressao.pdf'));
}
