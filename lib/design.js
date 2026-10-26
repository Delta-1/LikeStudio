import { dimensions } from './formats.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
function lines(text, limit) {
  const result=[];let line='';
  for(const word of String(text || '').split(/\s+/)) for(const chunk of word.match(new RegExp(`.{1,${limit}}`,'gu'))||[]) {
    if((line+' '+chunk).trim().length>limit && line){result.push(line);line='';}line=(line+' '+chunk).trim();
  }
  if(line)result.push(line);return result;
}
const txt=(text,x,y,size,color,limit,weight=400,leading=size*1.22)=>`<text font-family="Montserrat, DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${lines(text,limit).map((s,i)=>`<tspan x="${x}" y="${y+i*leading}">${esc(s)}</tspan>`).join('')}</text>`;
const svg=(w,h,content)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1080 ${h/w*1080}">${content}</svg>`;
const arrow=(x,y,color)=>`<path d="M${x-12} ${y}h24m-10-10 10 10-10 10" stroke="${color}" stroke-width="4" fill="none"/>`;
function brandMark(brand,x,y,ink,accent,size=34){return `<path d="M${x} ${y-47}q45-68 110-15" fill="none" stroke="${accent}" stroke-width="8"/>`+txt(brand.name||'CAPISOL',x,y,size,ink,size>40?24:40,700)+(brand.name==='CAPISOL'?txt('ENERGIA SOLAR',x+2,y+25,13,ink,30,700):'');}

export function posterSvg(slide,brand,format,index,total) {
  const [w,h]=dimensions(format,brand.placement), H=h/w*1080;
  const solar=brand.design==='capisol',navy=solar?'#0B2D5B':'#161320',yellow=solar?'#F6C300':brand.color||'#8b5cf6',white='#FFFFFF';
  if(format==='business-card') return cardSvg(slide,brand,index,w,h,navy,yellow);
  const variant=brand.layout && brand.layout!=='auto'?brand.layout:(index>0 && format==='carousel'?'clean':({institutional:'institutional',economy:'economy',service:'service',promotion:'service',quote:'cover'})[brand.purpose]||'cover');
  const light=['institutional','economy','clean'].includes(variant),ink=light?navy:white;
  const landscape=H<800, square=H<1200 && !landscape, print=format==='flyer';
  const x=print?88:70, titleY=landscape?180:square?260:340;
  const footerH=print?245:landscape?125:165, footerTop=H-footerH;
  const details=brand.details||{},isMaterial=['flyer','ad'].includes(format);
  let font=landscape?40:54,bodySize=landscape?21:27,titleLines,bodyLines,bodyLimit,bodyY,offerY,ctaY;
  for(let attempt=0;attempt<18;attempt++){
    const titleLimit=Math.floor((landscape?630:570)/(font*.58));bodyLimit=Math.floor((landscape?650:570)/(bodySize*.55));
    titleLines=lines(slide.title,titleLimit);bodyLines=lines(slide.body,bodyLimit);
    bodyY=titleY+(titleLines.length-1)*font*1.22+(landscape?50:72);
    offerY=bodyY+bodyLines.length*bodySize*1.22+30;
    const offerHeight=details.offer?lines(details.offer,45).length*25+30:0;
    ctaY=Math.max(offerY+offerHeight+10,footerTop-95);
    if(ctaY+62<=footerTop-15)break;
    font=Math.max(24,font-2);bodySize=Math.max(15,bodySize-1);
  }
  const footerInk=light?navy:white,contacts=[details.phone,details.email,details.website,details.address].filter(Boolean),footerLines=contacts.length?contacts:brand.handle?[brand.handle]:[];
  const defaultCta=isMaterial||['service','quote','promotion'].includes(brand.purpose)?'Fale com nossa equipe':index<total-1?'Continue para descobrir':'Salve para consultar';
  const cta=details.cta||defaultCta;
  let content=`<defs><linearGradient id="side"><stop offset="0" stop-color="${light?white:navy}"/><stop offset=".47" stop-color="${light?white:navy}" stop-opacity=".98"/><stop offset=".72" stop-color="${light?white:navy}" stop-opacity=".6"/><stop offset="1" stop-color="${light?white:navy}" stop-opacity=".04"/></linearGradient><linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="${navy}" stop-opacity="0"/><stop offset="1" stop-color="${navy}" stop-opacity=".4"/></linearGradient></defs><rect width="1080" height="${H}" fill="url(#side)"/><rect width="1080" height="${H}" fill="url(#base)"/>`;
  content+=`<path d="M920 0h160v260Q875 200 920 0" fill="${yellow}"/><path d="M1080 ${H*.60}q-230 65-290 250l290-105Z" fill="${yellow}"/><path d="M0 ${H-285}q60 190 300 285H0Z" fill="${yellow}"/>`;
  if(variant==='clean')content+=`<defs><linearGradient id="clean" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset=".50" stop-color="white" stop-opacity=".97"/><stop offset=".78" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect width="1080" height="${H}" fill="url(#clean)"/>`;
  content+=brandMark(brand,x,landscape?100:155,ink,yellow,landscape?27:34);
  if(!landscape)content+=txt(({institutional:'ENERGIA QUE FACILITA',service:'MANUTENÇÃO SOLAR',economy:'MAIS ECONOMIA',guide:'GUIA SOLAR',quote:'SEU PROJETO SOLAR',promotion:'CONHEÇA NOSSAS SOLUÇÕES'})[brand.purpose]||'ENERGIA SOLAR',x,titleY-75,16,ink,38,700);
  content+=`<text font-family="Montserrat, DejaVu Sans, sans-serif" font-size="${font}" font-weight="700" fill="${ink}">${titleLines.map((s,i)=>`<tspan x="${x}" y="${titleY+i*font*1.22}" fill="${i===titleLines.length-1&&!light?yellow:ink}">${esc(s)}</tspan>`).join('')}</text>`;
  content+=txt(slide.body,x,bodyY,bodySize,ink,bodyLimit);
  // The offer is a user-provided field; never derive it from the reference's example percentage.
  if(details.offer)content+=`<rect x="${x}" y="${offerY-28}" width="535" height="${lines(details.offer,45).length*25+20}" rx="18" fill="${light?white:navy}"/>`+txt(details.offer,x+20,offerY,20,ink,45,700);
  const hasRoom=ctaY+62<=footerTop-15;
  if(hasRoom)content+=`<rect x="${x}" y="${ctaY}" width="550" height="62" rx="31" fill="${yellow}"/>`+txt(cta,x+25,ctaY+39,19,navy,45,700)+arrow(x+515,ctaY+31,navy);
  content+=`<rect x="0" y="${footerTop}" width="1080" height="${footerH}" fill="${light?white:navy}"/>`;
  if(print){let fy=footerTop+50;for(const contact of footerLines){content+=txt(contact,x,fy,19,footerInk,78);fy+=lines(contact,78).length*25+7;}}
  else {content+=txt((brand.handle||'Energia que não limita, facilita.').slice(0,48),x,footerTop+(landscape?32:52),20,footerInk,50);if(total>1)content+=txt(`${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,900,footerTop+(landscape?32:52),22,light?navy:yellow,12,700);const contact=contacts.slice(0,2).join(' · ');if(contact)content+=txt(contact,x,footerTop+(landscape?62:90),18,footerInk,85);content+=txt('Visual ilustrativo gerado por IA',x,footerTop+footerH-26,13,light?'#49617E':'#BDCEE0',70);}
  return svg(w,h,content);
}
function cardSvg(slide,brand,index,w,h,navy,yellow){
  const H=h/w*1080,white='#FFFFFF',back=index===1,ink=back?navy:white,x=80,d=brand.details||{};
  let content=`<rect width="1080" height="${H}" fill="${back?white:navy}" fill-opacity="${back?'.98':'.94'}"/><path d="M850 0h230v${H}H980Q650 400 850 0" fill="${yellow}"/><path d="M1080 120v${H}H900Q730 430 1080 120" fill="${navy}"/>`;
  if(!back){content+=brandMark(brand,x,190,white,yellow,(brand.name||'').length>30?30:50);content+=txt(slide.title,x,320,slide.title.length>65?28:35,white,slide.title.length>65?40:32,700);content+=txt(slide.body,x,445,21,'#E9EEF4',49);}
  else {content+=txt(slide.title,x,105,22,navy,45,700);content+=txt(d.person||brand.name||'CAPISOL',x,180,30,navy,42,700);if(d.role)content+=txt(d.role,x,260,19,navy,60);let cy=325;for(const value of [d.phone,d.email,d.website,d.address,brand.handle].filter(Boolean)){content+=txt(value,x,cy,17,navy,75);cy+=lines(value,75).length*21+9;}}
  return svg(w,h,content);
}
