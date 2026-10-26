import { icon } from './icons.js';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const activeStatuses = ['queued','researching','writing','imaging','narrating','rendering'];
const types = { carousel: ['Carrossel','layers'], post: ['Post único','image'], story: ['Story','story'], reel: ['Vídeo','video'] };
const styles = { editorial:'Editorial', minimal:'Minimalista', bold:'Impactante', illustration:'Ilustrado' };
const tones = { didatico:'Didático', profissional:'Profissional', descontraido:'Descontraído', impactante:'Impactante' };
const languages = { 'pt-BR':'Português', es:'Español', en:'English' };
const periods = { day:'Últimas 24 horas', week:'Últimos 7 dias', month:'Últimos 30 dias', any:'Sem limite' };
const colors = ['#8b5cf6','#3b82f6','#10b981','#f97316','#ec4899','#d4a356'];
const state = { session:null,jobs:[],page:'gallery',filter:'all',query:'',sort:'new',view:'grid',wizard:null,step:0,error:'',busy:false,draft:null,detail:null,index:0,media:'images',editing:false,lastJobs:'',models:[] };
const blank = () => ({ format:'carousel', idea:'', audience:'Público geral', research:true, period:'week', count:5, language:'pt-BR', tone:'didatico', style:'editorial', instructions:'', videoMode:'narrated', voice:'Kore' });
async function api(path, options = {}) {
  let response;
  try { response = await fetch(`/api${path}`, { ...options, headers:{ ...(options.body ? { 'Content-Type':'application/json' } : {}), ...options.headers }, ...(options.body && typeof options.body !== 'string' ? { body:JSON.stringify(options.body) } : {}) }); }
  catch { throw new Error('Sem conexão com o estúdio. Verifique sua internet e tente novamente.'); }
  const data = await response.json().catch(() => ({ error:'Resposta inesperada do servidor.' }));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
function applyTheme(theme) { document.documentElement.dataset.theme = theme; localStorage.setItem('likestudio-theme', theme); }
applyTheme(localStorage.getItem('likestudio-theme') === 'light' ? 'light' : 'dark');
const date = value => new Intl.DateTimeFormat('pt-BR', {day:'2-digit',month:'short'}).format(new Date(value));
const files = (id, name, download = false) => `/api/jobs/${id}/files/${name}${download ? '?download' : ''}`;
const btn = (action,label,ic,cls='',extra='') => `<button class="btn ${cls}" data-action="${action}" ${extra}>${ic?icon(ic):''}${label}</button>`;
const iconBtn = (action,label,ic,extra='') => `<button class="icon-btn" data-action="${action}" title="${label}" aria-label="${label}" ${extra}>${icon(ic)}</button>`;
function nav() {
  return `<aside class="rail"><img class="brandmark" src="/icon.svg" alt="LikeStudio"><nav class="rail-nav" aria-label="Navegação principal">${[['gallery','grid','Galeria'],['templates','spark','Modelos'],['settings','settings','Ajustes']].map(([p,ic,t])=>`<button class="rail-btn ${state.page===p?'active':''}" data-action="navigate" data-value="${p}" ${state.page===p?'aria-current="page"':''}>${icon(ic)}<span>${t}</span></button>`).join('')}</nav><div class="rail-bottom"><span class="eyebrow" style="font-size:.5rem">SEU ESTÚDIO</span><div class="avatar">${esc((state.session.settings.name || 'LS').slice(0,2).toUpperCase())}</div></div></aside>`;
}
function render() {
  const s = state.session;
  $('#app').innerHTML = `<div class="shell">${nav()}<header class="topbar"><div class="top-left"><div class="wordmark">like<span>studio</span><span style="color:var(--purple)">.</span></div><div class="divider"></div><span class="workspace-name">${esc(s.settings.name || 'Meu espaço criativo')}</span></div><div class="top-right"><button class="status-pill" data-action="connect"><span class="dot ${s.connected?'on':''}"></span>${s.connected?'Gemini conectado':'Conectar API'}${icon('chevron')}</button>${iconBtn('theme','Alternar tema',document.documentElement.dataset.theme==='light'?'moon':'sun')}<div class="avatar">${esc((s.settings.name || 'EU').slice(0,2).toUpperCase())}</div></div></header><main class="main" id="main">${state.page==='gallery'?gallery():state.page==='templates'?templates():settings()}</main></div>`;
}
function hero() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">${icon('spark')} Da pesquisa à publicação</div><h2>Sua ideia merece<br>um <em>próximo post.</em></h2><p>Transforme um assunto em conteúdo que informa, inspira e dá vontade de compartilhar.</p>${btn('new','Vamos criar','arrow','white')}</div><div class="hero-art" aria-hidden="true"><div class="art-card one"><small>IDEIAS QUE CONECTAM</small><strong>O futuro<br>já começou.</strong></div><div class="art-card three"><small>UM NOVO OLHAR</small><strong>Menos ruído.<br>Mais ideias.</strong></div><div class="art-card two"><small>ARRASTE PARA DESCOBRIR</small>${icon('spark')}<strong>Uma ideia.<br>Infinitas<br>possibilidades.</strong></div><span class="art-note">UM POUCO DE INSPIRAÇÃO PARA COMEÇAR</span></div></section>`;
}
function gallery() {
  const active = state.jobs.filter(j=>activeStatuses.includes(j.status)).length, completed = state.jobs.filter(j=>j.status==='completed').length;
  return `<section class="page-heading"><div><div class="eyebrow">SEU ESPAÇO DE CRIAÇÃO</div><h1>Ideias em movimento<span style="color:var(--accent)">.</span></h1><p>Crie, acompanhe e encontre tudo por aqui.</p></div><div class="date-label">${icon('clock')}${new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long'}).format(new Date())}</div></section>${hero()}<section aria-label="Galeria de conteúdos"><div class="gallery-title"><h2>Seus conteúdos <span class="count">${state.jobs.length}</span></h2>${btn('new','Novo conteúdo','plus','primary','aria-label="Novo conteúdo"')}</div><div class="toolbar"><div class="filters" role="group" aria-label="Filtrar conteúdos">${[['all','Todos','grid'],['carousel','Carrosséis','layers'],['reel','Vídeos','video'],['post','Posts','image'],['story','Stories','story']].map(([v,l,ic])=>`<button class="filter ${state.filter===v?'active':''}" data-action="filter" data-value="${v}" aria-pressed="${state.filter===v}">${icon(ic)}${l}</button>`).join('')}</div><div class="tools"><div class="searchbox">${icon('search')}<input id="gallery-search" aria-label="Buscar conteúdo" placeholder="Buscar conteúdo…" value="${esc(state.query)}"></div><button class="sort" data-action="sort">${state.sort==='new'?'Mais recentes':'Mais antigos'}${icon('chevron')}</button><div class="view-switch" role="group" aria-label="Visualização">${['grid','list'].map(v=>`<button class="${state.view===v?'active':''}" data-action="view" data-value="${v}" aria-label="${v==='grid'?'Ver em grade':'Ver em lista'}" aria-pressed="${state.view===v}">${icon(v)}</button>`).join('')}</div></div></div><div class="stats-line" aria-live="polite"><span><i class="active-dot"></i>${active} em criação</span><span>${icon('check')}${completed} ${completed===1?'concluído':'concluídos'}</span><span>${icon('folder')}Salvos no seu espaço</span></div><div id="gallery-items">${galleryItems()}</div></section><footer class="bottom-note"><span>${icon('key')}Sua chave. Suas ideias. Seu estúdio.</span><span>Feito para criar com mais intenção ${icon('heart')}</span></footer>`;
}
function galleryItems() {
  let list = state.jobs.filter(j=>(state.filter==='all'||state.filter===j.format)&&j.title.toLocaleLowerCase('pt-BR').includes(state.query.toLocaleLowerCase('pt-BR')));
  if (state.sort==='old') list = list.toReversed();
  if (!list.length) return `<div class="empty"><div class="empty-icon">${icon(state.jobs.length?'search':'layers')}</div><h3>${state.jobs.length?'Nenhum conteúdo por aqui':'Toda boa criação começa com uma ideia.'}</h3><p>${state.jobs.length?'Tente outra busca ou escolha outro formato.':'Seu primeiro carrossel, post ou vídeo vai aparecer aqui. Você escolhe o assunto; o estúdio cuida do começo.'}</p>${btn(state.jobs.length?'reset-filter':'new',state.jobs.length?'Limpar filtros':'Criar meu primeiro conteúdo',state.jobs.length?'refresh':'plus',state.jobs.length?'':'primary')}</div>`;
  return `<div class="gallery ${state.view}">${list.map(card).join('')}</div>`;
}
function card(j) {
  const active = activeStatuses.includes(j.status), ok = j.status==='completed', status = ok?'Pronto para revisar':active?'Em criação':j.status==='cancelled'?'Cancelado':j.status==='interrupted'?'Interrompido':'Precisa de atenção';
  const cover = j.cover ? `<img src="${files(j.id,'slide-0.png')}?v=${encodeURIComponent(j.updatedAt)}" alt="Prévia de ${esc(j.title)}" loading="lazy">` : `<div class="progress-cover ${active?'processing':''}"><div class="orb">${icon(active?'spark':ok?'image':'alert')}</div><strong>${esc(j.stage)}</strong><small>${active?'Sua ideia está tomando forma':ok?'Abra para ver o conteúdo':'Abra para ver os detalhes'}</small>${active?`<div class="progress"><i style="width:${j.progress}%"></i></div>`:''}</div>`;
  // A version query is only for revalidation; exported filenames never depend on user input.
  return `<article class="creation" tabindex="0" role="button" aria-label="Abrir ${esc(j.title)}" data-action="open" data-value="${j.id}"><div class="creation-preview">${cover}<span class="badge ${ok?'ok':active?'':'err'}">${icon(ok?'check':active?'clock':'alert')}${ok&&j.reviewed?'Revisado':status}</span><span class="badge preview-count">${icon(types[j.format][1])}${j.count} ${j.format==='reel'?'cenas':j.count===1?'página':'páginas'}</span>${active&&j.cover?`<div class="processing-overlay">${esc(j.stage)}<div class="progress"><i style="width:${j.progress}%"></i></div></div>`:''}</div><div class="creation-body"><h3>${esc(j.title)}</h3><div class="creation-meta"><span class="type">${icon(types[j.format][1])}${types[j.format][0]}</span><span>${date(j.createdAt)}</span></div></div></article>`;
}
const templateData = [
  { title:'Notícia que vira conversa',desc:'Contexto, fatos e o que muda na prática.',theme:'t1',headline:'O que muda<br>a partir de agora?',icon:'globe',idea:'Quais novidades recentes em inteligência artificial podem ajudar pequenos negócios?',format:'carousel',style:'editorial',research:true },
  { title:'Explicação em poucos segundos',desc:'Imagens, voz e uma ideia por cena.',theme:'t2',headline:'Entenda.<br>Em poucos<br>segundos.',icon:'play',idea:'Explique de forma simples como organizar uma rotina de estudos mais eficiente.',format:'reel',style:'bold',research:false },
  { title:'Conhecimento para salvar',desc:'Um carrossel didático, do início ao fim.',theme:'t3',headline:'Pequenas ideias.<br>Grandes<br>descobertas.',icon:'spark',idea:'Crie um guia didático sobre como usar a tecnologia para organizar o dia a dia.',format:'carousel',style:'minimal',research:false }
];
function templates() {
  return `<section class="page-heading"><div><div class="eyebrow">UM EMPURRÃO NA CRIATIVIDADE</div><h1>Comece com uma direção.</h1><p>Roteiros e prompts preparados. Você adapta o assunto.</p></div></section><div class="template-grid">${templateData.map((t,i)=>`<button class="template" data-action="template" data-value="${i}"><div class="template-art ${t.theme}"><span class="eyebrow">MODELO DE CONTEÚDO · PERSONALIZÁVEL</span>${icon(t.icon)}<h3>${t.headline}</h3></div><div class="template-description"><div><strong>${t.title}</strong><p>${t.desc}</p></div>${icon('arrow')}</div></button>`).join('')}</div><div class="notice" style="margin-top:24px">${icon('info')}Estes são pontos de partida, com instruções de roteiro e estilo. Imagens e conteúdo são gerados para o seu assunto ao iniciar uma criação.</div>`;
}
function settings() {
  const s = state.session.settings, models = { ...state.session.defaults,...s.models };
  return `<section class="page-heading"><div><div class="eyebrow">DO SEU JEITO</div><h1>Seu estúdio, sua identidade.</h1><p>Configure uma vez. Continue criando.</p></div></section><section class="settings-panel"><h2>Sua conexão com a IA</h2><p>Uma chave Gemini para pesquisar, escrever e gerar conteúdo.</p><div class="notice">${icon(state.session.connected?'check':'key')}<div>${state.session.connected?'Chave conectada e protegida no servidor.':'Conecte a chave da sua conta Google AI Studio para começar.'}<br><small>O uso da API é cobrado pelo Google no seu projeto.</small></div></div><div class="settings-actions">${btn('connect-key',state.session.connected?'Trocar chave':'Conectar minha chave','key','primary')}<a class="btn ghost" href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">Google AI Studio ${icon('external')}</a>${state.session.connected?btn('disconnect','Desconectar',null,'danger'):''}</div><details><summary>Modelos de IA · opções avançadas</summary><p class="field-note">Os modelos são conferidos automaticamente antes de gerar. Você também pode ajustar a seleção por aqui.</p><div class="model-fields">${[['text','Pesquisa e roteiro'],['image','Imagens'],['voice','Narração'],['video','Cenas de vídeo']].map(([role,label])=>`<div><label for="model-${role}">${label}</label><input id="model-${role}" value="${esc(models[role])}" spellcheck="false"></div>`).join('')}</div><div class="settings-actions">${btn('save-models','Salvar modelos','check')}${btn('auto-models','Ajustar automaticamente','spark')}${btn('list-models','Consultar disponíveis','refresh')}</div><div id="model-list" class="model-list"></div></details></section><section class="settings-panel"><h2>Identidade dos seus conteúdos</h2><p>Aplicada automaticamente às próximas criações.</p><div class="fields"><div><label for="brand-name">Nome da marca</label><input id="brand-name" maxlength="70" value="${esc(s.name)}" placeholder="Sua marca ou seu nome"></div><div><label for="brand-handle">Perfil do Instagram</label><input id="brand-handle" maxlength="60" value="${esc(s.handle)}" placeholder="@seuperfil"></div></div><div class="field"><span class="label">Cor de destaque</span><div class="colors">${colorButtons(s.color)}</div></div><div class="settings-actions"><span class="field-note">As criações anteriores mantêm sua identidade original.</span>${btn('save-brand','Salvar identidade','check','primary')}</div></section><section class="settings-panel"><h2>Aparência</h2><p>O mesmo conforto visual, em qualquer momento.</p><div class="theme-choice">${['dark','light'].map(t=>btn('set-theme',t==='dark'?'Escuro':'Claro',t==='dark'?'moon':'sun',document.documentElement.dataset.theme===t?'selected':'',`data-value="${t}"`)).join('')}</div><div class="notice" style="margin-top:22px">${icon('info')}Sua galeria está vinculada a este navegador. Limpar os cookies remove o acesso a este espaço. Baixe os arquivos que deseja guardar.</div></section>`;
}
function colorButtons(selected) { return colors.map(c=>`<button class="color ${selected===c?'selected':''}" data-action="color" data-value="${c}" style="--swatch:${c}" aria-label="Cor ${c}" aria-pressed="${selected===c}"></button>`).join(''); }
function option(action,value,title,desc,ic,selected,tag='') { return `<button class="option ${selected?'selected':''}" data-action="${action}" data-value="${esc(value)}" aria-pressed="${!!selected}"><span class="option-icon">${icon(ic)}</span><span class="option-text"><strong>${title}${tag?`<small class="tag">${tag}</small>`:''}</strong><p>${desc}</p></span><span class="radio"></span></button>`; }
function chips(field, options, selected) { return `<div class="chips">${options.map(([v,l])=>`<button class="chip ${String(selected)===String(v)?'selected':''}" data-action="choice" data-field="${field}" data-value="${esc(v)}" aria-pressed="${String(selected)===String(v)}">${l}</button>`).join('')}</div>`; }
function startCreate(preset) {
  state.draft = { ...blank(),...preset }; state.step=0; state.wizard='create'; state.error=''; state.busy=false;
  if (!state.session.connected) { state.pendingCreate=true; startConnect(); return; }
  renderWizard();
}
function startConnect(keyOnly=false) {
  state.wizard='connect'; state.step=keyOnly?1:0; state.error=''; state.busy=false;
  state.connectBrand = { ...state.session.settings }; renderWizard();
}
function modalLayout(content,total,footer) {
  const title = state.wizard==='connect'?'Seu estúdio começa aqui':'Uma ideia de cada vez';
  return `<div class="modal-head"><div class="wordmark">like<span>studio</span><span style="color:var(--purple)">.</span></div>${iconBtn('close-wizard','Fechar','close',state.busy?'disabled':'')}</div><div class="step-track" aria-label="Etapa ${state.step+1} de ${total}">${Array.from({length:total},(_,i)=>`<i class="${i<=state.step?'done':''}"></i>`).join('')}</div><div class="modal-content"><div class="eyebrow" style="margin-bottom:12px">${title}</div>${content}${state.error?`<p class="form-error" role="alert">${esc(state.error)}</p>`:''}</div><div class="modal-footer">${footer}</div>`;
}
function renderWizard() {
  const dialog = $('#wizard');
  // Keep a failed attempt in the masked input only, never in storage or HTML attributes.
  const previousKey = state.wizard === 'connect' && state.step === 1 ? dialog.querySelector('#api-key')?.value || '' : '';
  let content='',footer='';
  if (state.wizard==='connect') {
    if (state.step===0) {
      content=`<h2>Como você quer começar?</h2><p class="muted">Conecte sua conta de IA uma vez. Depois, é só trazer as ideias.</p><div class="question-options">${option('connect-start','have','Já tenho uma chave Gemini','Conectar e começar a criar.','key',false)}${option('connect-start','need','Ainda preciso de uma chave','Veja onde criar sua chave no Google AI Studio.','globe',false)}</div><div class="notice">${icon('info')}Pesquisa, imagens e vídeos usam os créditos da sua própria conta Gemini. Você controla o uso no Google.</div>`;
      footer=`${btn('close-wizard','Explorar primeiro',null,'ghost')}<span class="step-label">1 de 3 · Conexão</span>`;
    } else if (state.step===1) {
      content=`<h2>Vamos conectar sua IA.</h2><p class="muted">Cole a chave Gemini do seu projeto. Ela será validada sem gerar conteúdo pago e guardada de forma protegida.</p><label for="api-key">Chave da API Gemini</label><div class="key-input"><input id="api-key" type="password" placeholder="Cole sua chave aqui" autocomplete="off" spellcheck="false" maxlength="4096" autocapitalize="none" autocorrect="off" enterkeyhint="go" ${state.busy?'disabled':''}>${iconBtn('show-key','Mostrar ou ocultar chave','eye')}</div><div class="help-link"><span>Você só precisa configurar uma vez.</span><a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">Criar chave ${icon('external')}</a></div>${state.needsKey?'<div class="notice">'+icon('info')+'<div>No Google AI Studio, abra API Keys, crie uma chave e habilite o faturamento do projeto para os modelos pagos. Volte e cole a chave acima.</div></div>':''}<div class="notice">${icon('key')}Sua chave não aparece na galeria, nos downloads nem no código do site.</div>`;
      footer=`${btn('wizard-back','Voltar','back','ghost',state.busy?'disabled':'')}${btn('verify-key',state.busy?'Validando…':'Validar e continuar',state.busy?'clock':'arrow','primary',state.busy?'disabled':'')}`;
    } else {
      const b=state.connectBrand;
      content=`<h2>Vamos deixar com sua cara?</h2><p class="muted">Sua identidade entra nas próximas criações. Você pode ajustar tudo depois.</p><div class="fields"><div><label for="onboard-name">Nome da marca <span class="muted">· opcional</span></label><input id="onboard-name" placeholder="Como sua marca se chama?" value="${esc(b.name)}" maxlength="70"></div><div><label for="onboard-handle">Seu Instagram <span class="muted">· opcional</span></label><input id="onboard-handle" placeholder="@seuperfil" value="${esc(b.handle)}" maxlength="60"></div></div><div class="field"><span class="label">Escolha uma cor de destaque</span><div class="colors">${colorButtons(b.color)}</div></div><div class="notice">${icon('check')}Conexão pronta. Sua galeria está esperando pela primeira ideia.</div>`;
      footer=`<span class="step-label">3 de 3 · Identidade</span>${btn('finish-connect',state.busy?'Salvando…':'Entrar na galeria','arrow','primary',state.busy?'disabled':'')}`;
    }
    dialog.innerHTML=modalLayout(content,3,footer);
  } else {
    const d=state.draft;
    if (state.step===0) {
      content=`<h2>O que vamos criar?</h2><p class="muted">Escolha o formato. Os prompts e o roteiro já estão preparados para cada um.</p><div class="question-options format-options">${option('format','carousel','Carrossel','Uma ideia que se revela página por página.','layers',d.format==='carousel','POPULAR')}${option('format','reel','Vídeo explicativo','Cenas, voz e conteúdo em movimento.','video',d.format==='reel')}${option('format','post','Post único','Uma mensagem. Uma arte marcante.','image',d.format==='post')}${option('format','story','Story','Vertical, direto e feito para o momento.','story',d.format==='story')}</div>`;
    } else if (state.step===1) {
      content=`<h2>Qual é a sua ideia?</h2><p class="muted">Conte o assunto com suas palavras. Pode ser uma pergunta, uma notícia ou algo que você quer explicar.</p><label for="idea">Sobre o que vamos falar?</label><textarea id="idea" rows="3" maxlength="3000" placeholder="Ex.: O que mudou na inteligência artificial e como isso ajuda pequenos negócios?">${esc(d.idea)}</textarea><div class="suggestions">${[['IA para negócios','Quais novidades recentes em inteligência artificial podem ajudar pequenos negócios?'],['Dicas de estudo','Explique como criar uma rotina de estudos mais organizada e eficiente.'],['Uma novidade','Explique as principais novidades recentes em tecnologia para o público geral.']].map(([l,v])=>`<button class="chip" data-action="idea-suggestion" data-value="${esc(v)}">${l}</button>`).join('')}</div><div class="field"><span class="label">Para quem?</span>${chips('audience',[['Público geral','Público geral'],['Empreendedores','Empreendedores'],['Estudantes','Estudantes']],d.audience)}</div><div class="field"><span class="label">Pesquisar notícias e fontes na web?</span>${chips('research',[[true,'Sim, pesquisar'],[false,'Não, conteúdo atemporal']],d.research)}</div>${d.research?`<div class="field"><label for="period">Período da pesquisa</label><select id="period">${Object.entries(periods).map(([v,l])=>`<option value="${v}" ${d.period===v?'selected':''}>${l}</option>`).join('')}</select></div>`:''}`;
    } else if (state.step===2) {
      content=`<h2>Qual é a personalidade?</h2><p class="muted">Escolha a direção visual. O estúdio mantém a mesma identidade em toda a sequência.</p><div class="style-options">${Object.entries(styles).map(([v,l])=>`<button class="style-card ${d.style===v?'selected':''}" data-action="choice" data-field="style" data-value="${v}" aria-pressed="${d.style===v}"><div class="style-preview ${v}">${v==='illustration'?icon('spark'):`<strong>${v==='editorial'?'Uma nova ideia.':v==='minimal'?'essencial.':'PENSE NOVO.'}</strong>`}</div><div class="style-name">${l}${d.style===v?icon('check'):''}</div></button>`).join('')}</div><div class="field"><span class="label">Tom da conversa</span>${chips('tone',Object.entries(tones),d.tone)}</div><div class="fields" style="margin-top:19px"><div><label for="language">Idioma</label><select id="language">${Object.entries(languages).map(([v,l])=>`<option value="${v}" ${d.language===v?'selected':''}>${l}</option>`).join('')}</select></div>${d.format==='carousel'||d.format==='reel'?`<div><span class="label">${d.format==='reel'?'Cenas':'Páginas'}</span>${chips('count',(d.format==='reel'?[2,3,5]:[3,5,7,10]).map(n=>[n,String(n)]),d.count)}</div>`:''}</div>${d.format==='reel'?`<div class="field"><span class="label">Como será o vídeo?</span><div class="question-options">${option('video-mode','narrated','Imagens + narração','Artes em movimento, voz e textos na tela.','image',d.videoMode==='narrated','RECOMENDADO')}${option('video-mode','generated','Cenas geradas por IA','Cenas com movimento e áudio. Consome mais créditos.','video',d.videoMode==='generated')}</div></div>${d.videoMode==='narrated'?`<div class="field"><label for="voice">Voz da narração</label><select id="voice">${['Kore','Puck','Charon'].map(v=>`<option ${d.voice===v?'selected':''}>${v}</option>`).join('')}</select></div>`:''}`:''}<details><summary>Quer acrescentar algum detalhe? · opcional</summary><textarea id="instructions" rows="2" maxlength="1500" placeholder="Ex.: linguagem simples, exemplos do dia a dia, evitar termos técnicos…" style="margin-top:12px">${esc(d.instructions)}</textarea></details>`;
    } else {
      content=`<h2>Tudo pronto para dar vida.</h2><p class="muted">Acompanhe cada etapa na galeria. Você pode continuar navegando enquanto a criação acontece.</p><p class="review-idea">${esc(d.idea)}</p><div class="review-grid">${[['Formato',`${types[d.format][0]} · ${d.count} ${d.format==='reel'?'cenas':d.count===1?'página':'páginas'}`],['Estilo',styles[d.style]],['Tom e idioma',`${tones[d.tone]} · ${languages[d.language]}`],['Pesquisa',d.research?periods[d.period]:'Conteúdo atemporal']].map(([l,v])=>`<div class="review-item"><span>${l}</span><strong>${esc(v)}</strong></div>`).join('')}</div><div class="notice">${icon('key')}A criação usa créditos da sua API Gemini. O custo varia com pesquisa, imagens, voz e vídeo. Revise as informações e fontes antes de publicar.</div>${d.format==='reel'&&d.videoMode==='generated'?`<div class="notice warning">${icon('info')}Cada cena é solicitada com cerca de 8 segundos. Duração e fala podem variar conforme o resultado da IA.</div>`:''}${d.format==='reel'&&!state.session.videoAvailable?`<div class="notice error">${icon('alert')}Este servidor ainda não tem o FFmpeg necessário para exportar vídeos. Escolha outro formato ou configure o servidor.</div>`:''}`;
    }
    footer=`${state.step?btn('wizard-back','Voltar','back','ghost',state.busy?'disabled':''):`<span class="step-label">1 de 4 · Formato</span>`}${btn('wizard-next',state.busy?'Criando…':state.step===3?'Criar conteúdo':'Continuar',state.step===3?'spark':'arrow','primary',state.busy||state.step===3&&d.format==='reel'&&!state.session.videoAvailable?'disabled':'')}`;
    dialog.innerHTML=modalLayout(content,4,footer);
  }
  if (previousKey && dialog.querySelector('#api-key')) dialog.querySelector('#api-key').value = previousKey;
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(()=>{ const focus=dialog.querySelector('textarea,input:not([type=hidden]),.option.selected,button.btn.primary'); if(focus&&!state.busy) focus.focus({preventScroll:true}); });
}
function collectStep() {
  if(state.wizard==='connect') {
    if($('#onboard-name')) state.connectBrand.name=$('#onboard-name').value;
    if($('#onboard-handle')) state.connectBrand.handle=$('#onboard-handle').value;
  } else {
    for(const f of ['idea','period','language','instructions','voice']) if($(`#${f}`)) state.draft[f]=$(`#${f}`).value;
  }
}
function closeWizard(){if(state.busy)return;collectStep();$('#wizard').close();state.wizard=null;state.error='';}
async function refreshJobs(force=false) {
  const data=await api('/jobs'), serialized=JSON.stringify(data.jobs); state.jobs=data.jobs;
  if(force||serialized!==state.lastJobs) {
    state.lastJobs=serialized;
    if(state.page==='gallery') {
      const focused=document.activeElement?.id;
      if(focused==='gallery-search') { $('#gallery-items').innerHTML=galleryItems(); }
      else render();
    }
  }
  if(state.detail&&activeStatuses.includes(state.detail.status)) {
    const latest=await api(`/jobs/${state.detail.id}`); state.detail=latest;renderDetail();
  }
}
async function openDetail(id) {
  state.detail=await api(`/jobs/${id}`);state.index=0;state.media=state.detail.video?'video':'images';state.editing=false;renderDetail();
}
function renderDetail() {
  const j=state.detail;if(!j)return;const dialog=$('#detail'),ok=j.status==='completed',active=activeStatuses.includes(j.status),available=j.checkpoints.slides||[],index=state.index,s=j.script?.slides[index];
  
  const image=available.includes(index)?`<img class="preview-image ${j.brief.format==='reel'||j.brief.format==='story'?'vertical':''}" src="${files(j.id,`slide-${index}.png`)}?v=${encodeURIComponent(j.updatedAt)}" alt="Página ${index+1}: ${esc(s?.title||'Prévia')}">`:`<div class="preview-image"><div class="progress-cover ${active?'processing':''}"><div class="orb">${icon(active?'spark':'alert')}</div><strong>${esc(j.stage)}</strong><small>${active?'O progresso aparece na galeria':'Confira a mensagem ao lado'}</small><div class="progress"><i style="width:${j.progress}%"></i></div></div></div>`;
  dialog.innerHTML=`<header class="detail-header"><div><small>${types[j.brief.format][0]} · ${date(j.createdAt)}</small><h2>${esc(j.script?.title||j.brief.idea)}</h2></div>${iconBtn('close-detail','Fechar conteúdo','close')}</header><div class="detail-grid"><div class="detail-preview">${j.video?`<div class="chips">${btn('preview-images','Páginas','layers',state.media==='images'?'selected':'')}${btn('preview-video','Vídeo','video',state.media==='video'?'selected':'')}</div>`:''}${state.media==='video'&&j.video?`<video class="preview-image vertical" src="${files(j.id,'video.mp4')}?v=${encodeURIComponent(j.updatedAt)}" controls playsinline preload="metadata"></video>`:image}${state.media==='images'?`<div class="preview-navigation">${iconBtn('prev-slide','Página anterior','back',index===0?'disabled':'')}<span>${index+1} de ${j.brief.count}</span>${iconBtn('next-slide','Próxima página','arrow',index>=j.brief.count-1?'disabled':'')}</div>${available.length?`<div class="thumbs">${available.map(i=>`<button class="thumb ${i===index?'active':''}" data-action="thumb" data-value="${i}" aria-label="Ver página ${i+1}"><img src="${files(j.id,`slide-${i}.png`)}?v=${encodeURIComponent(j.updatedAt)}" alt=""></button>`).join('')}</div>`:''}`:''}${ok&&available.includes(index)&&state.media==='images'?`<a href="${files(j.id,`slide-${index}.png`,true)}" class="btn ghost">${icon('download')}Baixar esta página</a>`:''}</div><div class="detail-content">${j.error?`<div class="notice error" style="margin-bottom:23px">${icon('alert')}<div>${esc(j.error)}</div></div>`:''}${active?`<div class="detail-section"><h3>${esc(j.stage)}</h3><p class="field-note">As etapas concluídas ficam salvas. Você pode fechar esta janela e acompanhar na galeria.</p><div class="progress"><i style="width:${j.progress}%"></i></div></div>`:''}${state.editing?`<section class="detail-section"><h3>Editar página ${index+1}</h3><p class="field-note" style="margin-bottom:15px">Altere os textos sem gerar uma nova imagem. Em vídeos, a narração original é mantida.</p><label for="edit-title">Título</label><textarea id="edit-title" rows="2" maxlength="100">${esc(s.title)}</textarea><label for="edit-body" style="margin-top:12px">Texto</label><textarea id="edit-body" rows="3" maxlength="240">${esc(s.body)}</textarea><label for="edit-caption" style="margin-top:12px">Legenda</label><textarea id="edit-caption" rows="6" maxlength="2200">${esc(j.script.caption)}</textarea><div class="settings-actions">${btn('cancel-edit','Cancelar',null,'ghost')}${btn('save-edit','Salvar alterações','check','primary',state.busy?'disabled':'')}</div></section>`:`${s?`<section class="detail-section"><div class="section-title"><h3>Página ${index+1}</h3>${ok?btn('edit','Editar textos','edit','ghost'):''}</div><strong style="font-size:.9rem">${esc(s.title)}</strong><p class="caption-text" style="margin-top:8px">${esc(s.body)}</p></section>`:''}${j.script?`<section class="detail-section"><div class="section-title"><h3>Legenda do post</h3>${iconBtn('copy-caption','Copiar legenda e fontes','copy')}</div><p class="caption-text">${esc(j.script.caption)}</p></section>`:''}<section class="detail-section"><h3>Pesquisa e referências</h3>${j.research?`<p class="field-note">Fontes consultadas em ${new Date(j.research.checkedAt).toLocaleString('pt-BR')}. Abra para conferir o contexto.</p>${j.research.sources.map(s=>`<a class="source" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${icon('globe')}<span>${esc(s.title)}<small>${esc(new URL(s.url).hostname)}</small></span>${icon('external')}</a>`).join('')}<details><summary>Ver resumo da pesquisa</summary><p class="caption-text" style="margin-top:12px">${esc(j.research.summary)}</p></details><iframe class="search-widget" src="/api/jobs/${j.id}/search-widget" title="Sugestões de busca do Google" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>`:`<p class="field-note">${j.brief.research?'As fontes aparecerão quando a pesquisa for concluída.':'A pesquisa foi desativada nesta criação. Conteúdo sem verificação de notícias atuais.'}</p>`}</section>${ok?`<div class="notice">${icon('info')}Visuais ilustrativos criados por IA. Confira textos, imagens e fontes antes de publicar.</div><label class="review-check"><input id="reviewed" type="checkbox" ${j.reviewed?'checked':''}>Conferi o conteúdo e as fontes desta criação.</label>`:''}`}</div></div><footer class="detail-bottom"><div>${active?btn('cancel-job','Cancelar criação',null,'danger'):btn('delete-job','Excluir','trash','danger',state.busy?'disabled':'')}</div><div class="detail-actions">${!active&&!ok?btn('retry-job','Retomar criação','refresh','primary'):''}${ok?`<a class="btn" href="${files(j.id,'legenda.txt',true)}">${icon('download')}Legenda</a>${j.video?`<a class="btn" href="${files(j.id,'video.mp4',true)}">${icon('download')}MP4</a>`:''}<a class="btn primary" href="/api/jobs/${j.id}/download">${icon('download')}Baixar tudo</a>`:''}</div></footer>`;
  if(!dialog.open)dialog.showModal();
}
function closeDetail(){if(state.busy)return;$('#detail').close();state.detail=null;state.editing=false;}
async function saveSettings(patch) {
  const result=await api('/settings',{method:'PUT',body:patch});state.session.settings=result.settings;state.session.connected=result.connected;applyTheme(result.settings.theme);return result;
}
async function handle(action,el) {
  const value=el.dataset.value;
  switch(action) {
    case 'navigate':state.page=value;render();break;
    case 'new':startCreate();break;
    case 'template':{const t=templateData[Number(value)];startCreate({idea:t.idea,format:t.format,style:t.style,research:t.research,count:t.format==='reel'?3:5});break;}
    case 'connect':state.session.connected?(state.page='settings',render()):startConnect();break;
    case 'connect-key':startConnect(true);break;
    case 'theme':{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';await saveSettings({theme});render();break;}
    case 'set-theme':await saveSettings({theme:value});render();break;
    case 'filter':state.filter=value;render();break;
    case 'reset-filter':state.query='';state.filter='all';render();break;
    case 'sort':state.sort=state.sort==='new'?'old':'new';render();break;
    case 'view':state.view=value;render();break;
    case 'open':await openDetail(value);break;
    case 'close-wizard':closeWizard();break;
    case 'connect-start':state.needsKey=value==='need';state.step=1;state.error='';renderWizard();break;
    case 'show-key':if($('#api-key'))$('#api-key').type=$('#api-key').type==='password'?'text':'password';break;
    case 'verify-key':{
      const key=$('#api-key').value.trim();if(!key){state.error='Cole sua chave para continuar.';renderWizard();return;}
      state.busy=true;state.error='';renderWizard();
      try{const result=await saveSettings({apiKey:key});state.models=result.models||[];state.step=2;state.connectBrand={...state.session.settings};render();}
      catch(e){state.error=e.message;}finally{state.busy=false;renderWizard();}break;
    }
    case 'finish-connect':{collectStep();state.busy=true;el.disabled=true;
      try{await saveSettings({name:state.connectBrand.name,handle:state.connectBrand.handle,color:state.connectBrand.color,onboarded:true});state.busy=false;closeWizard();state.page='gallery';render();toast('Seu estúdio está pronto. Vamos criar?');if(state.pendingCreate){state.pendingCreate=false;state.wizard='create';state.step=0;state.draft=state.draft||blank();renderWizard();}}
      catch(e){state.error=e.message;state.busy=false;renderWizard();}break;}
    case 'wizard-back':collectStep();state.step=Math.max(0,state.step-1);state.error='';renderWizard();break;
    case 'format':collectStep();state.draft.format=value;state.draft.count=value==='carousel'?5:value==='reel'?3:1;state.error='';renderWizard();break;
    case 'choice':collectStep();state.draft[el.dataset.field]=el.dataset.field==='research'?value==='true':el.dataset.field==='count'?Number(value):value;renderWizard();break;
    case 'video-mode':collectStep();state.draft.videoMode=value;renderWizard();break;
    case 'idea-suggestion':state.draft.idea=value;$('#idea').value=value;$('#idea').focus();break;
    case 'wizard-next':{
      collectStep();state.error='';
      if(state.step===1&&state.draft.idea.trim().length<8){state.error='Conte sua ideia em pelo menos 8 caracteres.';renderWizard();return;}
      if(state.step<3){state.step++;renderWizard();return;}
      state.busy=true;el.disabled=true;el.textContent='Criando…';
      try{await api('/jobs',{method:'POST',body:state.draft});state.busy=false;closeWizard();state.page='gallery';await refreshJobs(true);toast('Criação iniciada. Acompanhe o progresso na galeria.');}
      catch(e){state.busy=false;state.error=e.message;renderWizard();}break;
    }
    case 'color':{
      if(state.wizard==='connect'){collectStep();state.connectBrand.color=value;renderWizard();}
      else{document.querySelectorAll('.color').forEach(b=>{b.classList.toggle('selected',b.dataset.value===value);b.setAttribute('aria-pressed',String(b.dataset.value===value));});}break;
    }
    case 'save-brand':el.disabled=true;try{await saveSettings({name:$('#brand-name').value,handle:$('#brand-handle').value,color:$('.color.selected')?.dataset.value||state.session.settings.color});render();toast('Identidade salva para suas próximas criações.');}finally{el.disabled=false;}break;
    case 'save-models':{el.disabled=true;try{const models=Object.fromEntries(['text','image','voice','video'].map(r=>[r,$(`#model-${r}`).value.trim()]));await saveSettings({models});toast('Modelos salvos.');}finally{el.disabled=false;}break;}
    case 'auto-models':el.disabled=true;try{const result=await api('/models/auto',{method:'POST'});state.session.settings=result.settings;render();toast('Modelos disponíveis selecionados. Agora você pode retomar a criação.');}finally{el.disabled=false;}break;
    case 'list-models':el.disabled=true;try{const {models}=await api('/models');$('#model-list').textContent=models.map(m=>m.id).join('\n');}finally{el.disabled=false;}break;
    case 'disconnect':if(confirm('Desconectar esta chave? Seus conteúdos serão mantidos.')){await api('/settings/key',{method:'DELETE'});state.session.connected=false;render();toast('Chave desconectada.');}break;
    case 'close-detail':closeDetail();break;
    case 'prev-slide':if(!state.editing){state.index--;renderDetail();}else toast('Salve ou cancele a edição antes de trocar de página.');break;
    case 'next-slide':if(!state.editing){state.index++;renderDetail();}else toast('Salve ou cancele a edição antes de trocar de página.');break;
    case 'thumb':if(!state.editing){state.index=Number(value);renderDetail();}else toast('Salve ou cancele a edição antes de trocar de página.');break;
    case 'preview-images':state.media='images';renderDetail();break;
    case 'preview-video':if(!state.editing){state.media='video';renderDetail();}else toast('Salve ou cancele a edição antes de ver o vídeo.');break;
    case 'copy-caption':{const j=state.detail;const caption=j.script.caption+(j.research?.sources?.length?'\n\nFontes:\n'+j.research.sources.map(s=>`${s.title}: ${s.url}`).join('\n'):'');try{await navigator.clipboard.writeText(caption);toast('Legenda e fontes copiadas.');}catch{toast('Não foi possível copiar. Você pode baixar a legenda.');}break;}
    case 'edit':state.editing=true;renderDetail();break;
    case 'cancel-edit':state.editing=false;renderDetail();break;
    case 'save-edit':{const j=state.detail;const slides=j.script.slides.map((s,i)=>({title:i===state.index?$('#edit-title').value:s.title,body:i===state.index?$('#edit-body').value:s.body}));const patch={caption:$('#edit-caption').value,slides};state.busy=true;el.disabled=true;el.textContent='Salvando…';try{state.detail=await api(`/jobs/${j.id}`,{method:'PATCH',body:patch});state.editing=false;state.busy=false;renderDetail();await refreshJobs();toast('Textos e arquivos atualizados.');}finally{state.busy=false;el.disabled=false;}break;}
    case 'cancel-job':if(confirm('Cancelar esta criação? Chamadas já enviadas ao Gemini podem ser cobradas.')){await api(`/jobs/${state.detail.id}/cancel`,{method:'POST'});toast('Cancelamento solicitado.');await refreshJobs();}break;
    case 'retry-job':if(confirm('Retomar as etapas pendentes? Confira seu consumo no Gemini: chamadas interrompidas podem ter sido cobradas.')){state.detail=await api(`/jobs/${state.detail.id}/retry`,{method:'POST'});renderDetail();await refreshJobs();toast('Criação retomada.');}break;
    case 'delete-job':if(confirm('Excluir este conteúdo e todos os arquivos? Esta ação não pode ser desfeita.')){await api(`/jobs/${state.detail.id}`,{method:'DELETE'});closeDetail();await refreshJobs(true);toast('Conteúdo excluído.');}break;
  }
}
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  if(el.tagName==='ARTICLE'&&event.target.closest('a,button'))return;
  try{await handle(el.dataset.action,el);}catch(e){toast(e.message);}
});
document.addEventListener('keydown',event=>{
  if(event.target.id==='api-key'&&event.key==='Enter'&&!state.busy){event.preventDefault();$('#wizard [data-action="verify-key"]')?.click();return;}
  const card=event.target.closest('.creation');if(card&&['Enter',' '].includes(event.key)){event.preventDefault();handle('open',card).catch(e=>toast(e.message));}
  if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&state.wizard==='create'){event.preventDefault();const next=$('[data-action="wizard-next"]');if(next&&!next.disabled)next.click();}
});
document.addEventListener('input',event=>{
  if(event.target.id==='gallery-search'){state.query=event.target.value;$('#gallery-items').innerHTML=galleryItems();}
});
document.addEventListener('change',async event=>{
  if(event.target.id==='reviewed'&&state.detail){const checkbox=event.target;checkbox.disabled=true;try{state.detail=await api(`/jobs/${state.detail.id}`,{method:'PATCH',body:{reviewed:checkbox.checked}});toast(checkbox.checked?'Conteúdo marcado como revisado.':'Revisão desmarcada.');await refreshJobs();}catch(e){checkbox.checked=!checkbox.checked;toast(e.message);}finally{checkbox.disabled=false;}}
});
$('#wizard').addEventListener('cancel',event=>{if(state.busy){event.preventDefault();return;}collectStep();state.wizard=null;});
$('#detail').addEventListener('cancel',event=>{if(state.busy){event.preventDefault();return;}state.detail=null;state.editing=false;});
let polling=false;
async function poll(){if(polling||document.hidden)return;polling=true;try{await refreshJobs();}catch{/* Keep the current gallery while offline. */}finally{polling=false;}}
async function boot(){try{state.session=await api('/session');applyTheme(state.session.settings.theme);await refreshJobs();render();if(!state.session.connected&&!state.session.settings.onboarded)startConnect();setInterval(poll,2500);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});}catch(e){$('#app').innerHTML=`<div class="loading-screen"><div><h2>Não foi possível abrir o estúdio.</h2><p class="muted" style="margin:15px 0">${esc(e.message)}</p>${btn('reload','Tentar novamente','refresh','primary')}</div></div>`;document.querySelector('[data-action=reload]').addEventListener('click',()=>location.reload());}}
boot();
