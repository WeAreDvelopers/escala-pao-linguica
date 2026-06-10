const VAGAS = 12;
const DIAS = [
  {id:'13',rotulo:'Sábado 13'},{id:'14',rotulo:'Domingo 14'},{id:'20',rotulo:'Sábado 20'},
  {id:'21',rotulo:'Domingo 21'},{id:'27',rotulo:'Sábado 27'},{id:'28',rotulo:'Domingo 28'}
];
const TURNOS = [
  {id:'tarde', chave:/vinagrete/i, rotulo:'Tarde · Vinagrete e molho', hora:'14h – 18h'},
  {id:'noite', chave:/montagem|atendimento/i, rotulo:'Noite · Barraca (montagem e atendimento)', hora:'17h30 – 23h'},
  {id:'fim',   chave:/final da festa/i, rotulo:'Encerramento · Organização barraca e cozinha', hora:'21h30 até terminar'}
];

// A página de admin marca <body data-admin="1">. A de visualização, não.
const ADMIN = document.body.dataset.admin === '1';

let respostas = [], removidos = [], pinAtivo = false;
let filtro = {dia:'todos', turno:'todos', pastoral:'todos'};

const norm = s => String(s||'').normalize('NFD').replace(/\p{M}/gu,'').trim().toLowerCase();
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const $ = id => document.getElementById(id);

function pinHeaders(){
  const h = {'Content-Type':'application/json'};
  if (pinAtivo){
    let pin = sessionStorage.getItem('pin');
    if (!pin){ pin = prompt('PIN de edição:') || ''; sessionStorage.setItem('pin', pin); }
    h['x-pin'] = pin;
  }
  return h;
}
async function api(rota, corpo){
  const r = await fetch(rota, {method:'POST', headers:pinHeaders(), body:JSON.stringify(corpo||{})});
  const j = await r.json().catch(()=>({}));
  if (r.status === 401){ sessionStorage.removeItem('pin'); }
  if (!r.ok) throw new Error(j.erro || 'Erro '+r.status);
  return j;
}

/* ---------- Carregamento ---------- */
async function carregar(){
  const r = await fetch('/api/dados');
  const j = await r.json();
  respostas = j.respostas.map(p=>{
    const funcoes = new Set(), dias = new Set();
    TURNOS.forEach(t=>{ if(t.chave.test(p.funcTexto)) funcoes.add(t.id); });
    DIAS.forEach(d=>{ if(new RegExp('\\b'+d.id+'\\b').test(p.diasTexto)) dias.add(d.id); });
    return {...p, funcoes, dias};
  });
  removidos = j.removidos;
  pinAtivo = j.pinAtivo;
  const ultSyncEl = $('ultSync');
  if (j.lastSync && ultSyncEl) ultSyncEl.textContent =
    '· última sincronização ' + new Date(j.lastSync).toLocaleString('pt-BR');
  const sheetUrlEl = $('sheetUrl');
  if (j.sheetConfigurada && sheetUrlEl) sheetUrlEl.placeholder = 'Link já configurado ✔ (cole outro para trocar)';
  montarChips(); render();
}

/* ---------- Ações (somente admin) ---------- */
async function salvarConfig(){
  const av = $('avisoSync');
  try{
    const url = $('sheetUrl').value.trim();
    await api('/api/config', {sheetUrl:url});
    av.className='aviso'; av.textContent = url ? '✔ Link salvo. Clique em Sincronizar agora.' : 'Link removido.';
  }catch(e){ av.className='aviso erro'; av.textContent = e.message; }
}
async function sincronizar(){
  const av = $('avisoSync');
  av.className='aviso'; av.textContent='Sincronizando…';
  try{
    const j = await api('/api/sync');
    av.textContent = `✔ ${j.respostas} respostas sincronizadas.`;
    await carregar();
  }catch(e){ av.className='aviso erro'; av.textContent = e.message; }
}
async function importar(substituir){
  const av = $('avisoImp');
  try{
    const texto = $('entrada').value;
    const j = await api('/api/importar', {texto, substituir});
    av.className='aviso'; av.textContent = `✔ ${j.importadas} resposta(s) importada(s).`;
    $('entrada').value='';
    await carregar();
  }catch(e){ av.className='aviso erro'; av.textContent = e.message; }
}
async function remover(nome, turno, dia){
  if (!confirm(`Tirar ${nome} de ${DIAS.find(d=>d.id===dia).rotulo} (${TURNOS.find(t=>t.id===turno).rotulo.split(' · ')[0].toLowerCase()})?`)) return;
  try{ await api('/api/remover', {nome, turno, dia}); await carregar(); }
  catch(e){ alert(e.message); }
}
async function restaurar(nome, turno, dia){
  try{ await api('/api/restaurar', {nome, turno, dia}); await carregar(); }
  catch(e){ alert(e.message); }
}
function toggleEdit(){
  document.body.classList.toggle('editando');
  $('btnEdit').classList.toggle('ativo');
}
function togglePrint(){
  document.body.classList.toggle('print');
  $('btnPrint').textContent =
    document.body.classList.contains('print') ? '✏️ Voltar' : '📸 Modo print';
}

/* ---------- Filtros ---------- */
function chip(rotulo, ativo, fn){
  const b=document.createElement('button');
  b.className='chip'+(ativo?' ativo':''); b.textContent=rotulo; b.onclick=fn; return b;
}
function montarChips(){
  const cd=$('chipsDia'); cd.innerHTML='';
  cd.append(chip('Todos', filtro.dia==='todos', ()=>{filtro.dia='todos';montarChips();render();}));
  DIAS.forEach(d=>cd.append(chip(d.rotulo, filtro.dia===d.id, ()=>{filtro.dia=d.id;montarChips();render();})));
  const ct=$('chipsTurno'); ct.innerHTML='';
  ct.append(chip('Todos', filtro.turno==='todos', ()=>{filtro.turno='todos';montarChips();render();}));
  TURNOS.forEach(t=>ct.append(chip(t.rotulo.split(' · ')[0], filtro.turno===t.id, ()=>{filtro.turno=t.id;montarChips();render();})));
  const cp=$('chipsPastoral'); cp.innerHTML='';
  const pastorais=[...new Set(respostas.flatMap(p=>String(p.pastoral).split(',').map(s=>s.trim()).filter(Boolean)))].sort();
  cp.append(chip('Todas', filtro.pastoral==='todos', ()=>{filtro.pastoral='todos';montarChips();render();}));
  pastorais.forEach(pa=>cp.append(chip(pa, filtro.pastoral===pa, ()=>{filtro.pastoral=pa;montarChips();render();})));
}

/* ---------- Renderização ---------- */
function render(){
  const main=$('escala');
  const busca=norm($('busca').value);
  main.innerHTML='';
  let totalPreench=0, totalVagas=0;

  TURNOS.filter(t=>filtro.turno==='todos'||filtro.turno===t.id).forEach(t=>{
    const grid=document.createElement('div'); grid.className='dias-grid';
    let cardsNoTurno=0;

    DIAS.filter(d=>filtro.dia==='todos'||filtro.dia===d.id).forEach(d=>{
      const vistos=new Set();
      const todos=respostas
        .filter(p=>p.funcoes.has(t.id)&&p.dias.has(d.id))
        .filter(p=>filtro.pastoral==='todos'||String(p.pastoral).split(',').map(s=>s.trim()).includes(filtro.pastoral))
        .sort((a,b)=>a.ordem-b.ordem)
        .filter(p=>{const k=norm(p.nome); if(vistos.has(k))return false; vistos.add(k); return true;});

      const remCelula = removidos.filter(r=>r.turno===t.id&&r.dia===d.id);
      const remSet = new Set(remCelula.map(r=>r.nome));
      const lista = todos.filter(p=>!remSet.has(norm(p.nome)));

      // filtro por nome: mostra só os cards onde a pessoa está
      if (busca && !lista.some(p=>norm(p.nome).includes(busca))) return;

      const n=lista.length;
      totalPreench+=Math.min(n,VAGAS); totalVagas+=VAGAS;
      const classeVagas = n>=VAGAS?'cheio':(n<=VAGAS/3?'critico':'');

      let lis='';
      for(let i=0;i<Math.max(VAGAS,n);i++){
        const p=lista[i];
        if(p){
          const hit = busca && norm(p.nome).includes(busca);
          lis+=`<li class="${i>=VAGAS?'extra':''} ${hit?'match':''}" data-nome="${esc(norm(p.nome))}">
                  <span class="num">${i+1}</span>
                  <span class="nome" title="${esc(p.nome)}${p.fone?' · '+esc(p.fone):''}">${esc(p.nome)}</span>
                  <span class="past">${esc(String(p.pastoral).split(',')[0].slice(0,14))}</span>
                  ${ADMIN?`<button class="btn-x" title="Tirar desta vaga" onclick="remover('${esc(p.nome)}','${t.id}','${d.id}')">×</button>`:''}
                </li>`;
        } else {
          lis+=`<li class="vazio"><span class="num">${i+1}</span><span class="nome">vaga aberta</span></li>`;
        }
      }
      const remHtml = (ADMIN && remCelula.length)
        ? `<div class="removidos tem"><b>Removidos:</b> ` + remCelula.map(r=>
            `${esc(r.nomeOriginal)} <button class="btn-rest" onclick="restaurar('${esc(r.nomeOriginal)}','${t.id}','${d.id}')">restaurar</button>`
          ).join(' · ') + `</div>`
        : '';

      grid.insertAdjacentHTML('beforeend',
        `<div class="card">
           <div class="card-cab">
             <span class="dia">${d.rotulo}</span>
             <span class="vagas ${classeVagas}">${Math.min(n,VAGAS)}/${VAGAS}${n>VAGAS?' +'+(n-VAGAS):''}</span>
           </div>
           <ol class="slots">${lis}</ol>${remHtml}
         </div>`);
      cardsNoTurno++;
    });

    if(cardsNoTurno){
      const sec=document.createElement('section'); sec.className='turno';
      sec.innerHTML=`<div class="turno-cab"><h2>${t.rotulo}</h2><span class="hora">${t.hora}</span></div>`;
      sec.append(grid); main.append(sec);
    }
  });

  if(!main.children.length) main.innerHTML='<p class="nada">Nenhum resultado com os filtros atuais.</p>';
  const unicos=new Set(respostas.map(p=>norm(p.nome))).size;
  $('resumo').innerHTML =
    `<b>${unicos}</b> voluntários · <b>${respostas.length}</b> respostas · <b>${totalPreench}</b> de <b>${totalVagas}</b> vagas na visão atual`;
}

/* ---------- Realce do nome ao passar o mouse ---------- */
(function(){
  const main=$('escala');
  function realcar(nome){
    main.querySelectorAll('li.realce').forEach(li=>li.classList.remove('realce'));
    if(!nome) return;
    main.querySelectorAll('li[data-nome="'+CSS.escape(nome)+'"]').forEach(li=>li.classList.add('realce'));
  }
  main.addEventListener('mouseover', e=>{
    const li=e.target.closest('li[data-nome]');
    realcar(li && li.dataset.nome);
  });
  main.addEventListener('mouseleave', ()=>realcar(null));
})();

carregar().catch(()=>{ $('resumo').textContent='Não foi possível carregar os dados — o servidor está rodando?'; });
// Atualiza a tela a cada 2 min para refletir sincronizações automáticas
setInterval(()=>carregar().catch(()=>{}), 120000);
