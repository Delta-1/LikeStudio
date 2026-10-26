export const PRINT = ['flyer','business-card'];
export const printSpec = format => format === 'flyer' ? { width:148, height:210, bleed:3, dpi:300 } : format === 'business-card' ? { width:90, height:50, bleed:3, dpi:300 } : null;
export function dimensions(format, placement = 'feed') {
  const spec=printSpec(format);
  if(spec) return [Math.round((spec.width+spec.bleed*2)/25.4*spec.dpi),Math.round((spec.height+spec.bleed*2)/25.4*spec.dpi)];
  if(format==='ad') return placement==='story'?[1080,1920]:placement==='square'?[1080,1080]:placement==='landscape'?[1920,1080]:[1080,1350];
  return ['story','reel'].includes(format)?[1080,1920]:[1080,1350];
}
export const aspectRatio = b => b.format==='business-card'?'16:9':b.format==='flyer'?'3:4':b.format==='ad'?({story:'9:16',square:'1:1',landscape:'16:9',feed:'4:5'}[b.placement]||'4:5'):['story','reel'].includes(b.format)?'9:16':'4:5';
