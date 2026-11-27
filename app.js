import { mountPitch } from './campinho.js';
import { mountMatchPitches } from './match-pitches.js';
import { finalLineups } from './lineups.js';

const $ = id => document.getElementById(id);
const KEY = 'catimba:v2';
const CBF_SOURCE = 'https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro/campeonato-brasileiro-serie-a/cbf-publica-tabela-detalhada-das-duas-rodadas-finais-do-brasileirao';
const PALMEIRAS_SOURCE = 'https://palmeiras.com.br/jogo/?idjogo=5307';
const names = {brasileirao:'Brasileirão Série A',libertadores:'Libertadores',carioca:'Campeonato Carioca',paulista:'Campeonato Paulista'};
const leagues = {brasileirao:'bra.1',libertadores:'conmebol.libertadores',carioca:'bra.camp.carioca',paulista:'bra.camp.paulista'};
const cbfMatch = (ref, round, home, away, stadium, kickoff) => ({id:`brasileirao:2026:cbf:${ref}`,competition:'brasileirao',season:'2026',round:String(round),home,away,stadium,kickoff});
const fixtures = [
  cbfMatch(370,37,'Chapecoense','Palmeiras','Arena Condá','2026-11-24T18:00:00-03:00'),
  cbfMatch(363,37,'São Paulo','Remo','Morumbis','2026-11-26T20:00:00-03:00'),
  cbfMatch(361,37,'Fluminense','Cruzeiro','Maracanã','2026-11-27T20:00:00-03:00'),
  cbfMatch(362,37,'Botafogo','Bahia','Nilton Santos','2026-11-28T21:00:00-03:00'),
  cbfMatch(368,37,'Coritiba','Flamengo','Couto Pereira','2026-11-29T16:00:00-03:00'),
  cbfMatch(369,37,'Vitória','Santos','Barradão','2026-11-29T16:00:00-03:00'),
  cbfMatch(364,37,'Corinthians','Grêmio','Neo Química Arena','2026-11-29T18:30:00-03:00'),
  cbfMatch(365,37,'Mirassol','Athletico-PR','José Maria de Campos Maia','2026-11-29T18:30:00-03:00'),
  cbfMatch(367,37,'Internacional','Red Bull Bragantino','Beira-Rio','2026-11-29T18:30:00-03:00'),
  cbfMatch(366,37,'Atlético-MG','Vasco da Gama','Arena MRV','2026-11-29T19:30:00-03:00'),
  ...[
    ['Flamengo','Chapecoense','Maracanã'],
    ['Vasco da Gama','Vitória','São Januário'],
    ['Santos','Botafogo','Vila Belmiro'],
    ['Palmeiras','Coritiba','Nubank Parque'],
    ['Red Bull Bragantino','Fluminense','Cícero de Souza Marques'],
    ['Cruzeiro','Internacional','Mineirão'],
    ['Grêmio','Mirassol','Arena do Grêmio'],
    ['Athletico-PR','São Paulo','Arena da Baixada'],
    ['Bahia','Atlético-MG','Arena Fonte Nova'],
    ['Remo','Corinthians','Mangueirão']
  ].map(([home,away,stadium],i)=>cbfMatch(371+i,38,home,away,stadium,'2026-12-02T21:30:00-03:00')),
  {id:'libertadores:2026:final:palmeiras-estudiantes',competition:'libertadores',season:'2026',round:'final',home:'Palmeiras',away:'Estudiantes',stadium:'Centenário, Montevidéu',kickoff:'2026-11-28T17:00:00-03:00'}
];
const blankState = () => ({version:2,participants:[{id:'carlinhos',name:'Carlinhos'},{id:'tiba',name:'Tiba'}],predictions:{},results:{},champions:{},lineups:{},teamLineups:{},legacy:{},updatedAt:null});
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validScore = value => value === null || (Number.isInteger(value) && value >= 0 && value <= 99);
const validPair = value => Array.isArray(value) && value.length === 2 && value.every(validScore);
const completePair = value => validPair(value) && value.every(Number.isInteger);
const normal = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
function validateState(value) {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.participants) || !value.participants.length || value.participants.length > 100) return false;
  const ids = new Set(), participantNames = new Set();
  for (const p of value.participants) {
    if (!isRecord(p) || typeof p.id !== 'string' || !/^[a-zA-Z0-9:-]{1,100}$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40 || participantNames.has(normal(p.name))) return false;
    ids.add(p.id); participantNames.add(normal(p.name));
  }
  if (!['carlinhos','tiba'].every(id=>ids.has(id))) return false;
  for (const k of ['predictions','results','champions','lineups','legacy']) if (!isRecord(value[k])) return false;
  for (const picks of Object.values(value.predictions)) if (!isRecord(picks) || Object.entries(picks).some(([id,pair])=>!ids.has(id)||!validPair(pair))) return false;
  if (Object.values(value.results).some(pair=>!validPair(pair))) return false;
  if (Object.entries(value.champions).some(([id,team])=>!ids.has(id)||!['','Palmeiras','Estudiantes'].includes(team))) return false;
  for (const [id,lineup] of Object.entries(value.lineups)) if (!ids.has(id)||!isRecord(lineup)||typeof lineup.teamName!=='string'||lineup.teamName.length>100||!Array.isArray(lineup.players)||lineup.players.length!==11||lineup.players.some(name=>typeof name!=='string'||name.length>100)) return false;
  if(value.teamLineups!==undefined) {
    if(!isRecord(value.teamLineups))return false;
    for(const [id,teams] of Object.entries(value.teamLineups)) {
      if(!ids.has(id)||!isRecord(teams))return false;
      for(const [team,lineup] of Object.entries(teams)) {
        if(!['Palmeiras','Estudiantes'].includes(team)||!isRecord(lineup)||typeof lineup.formation!=='string'||lineup.formation.length>50||!Array.isArray(lineup.players)||lineup.players.length!==11)return false;
        if(lineup.players.some(player=>!isRecord(player)||typeof player.name!=='string'||!player.name.trim()||player.name.length>100||typeof player.position!=='string'||player.position.length>100||!Number.isInteger(player.row)||player.row<0||player.row>3))return false;
        if(new Set(lineup.players.map(player=>normal(player.name))).size!==11)return false;
      }
    }
  }
  return true;
}
function recoverWarning(message) { $('storage-notice').hidden=false; $('storage-notice').textContent=message; }
function migrateLegacy(old) {
  const migrated=blankState();
  migrated.legacy=old;
  for (const [key,id] of [['37-1','brasileirao:2026:cbf:363'],['37-0','legacy:37-0']]) {
    const values=old[key];
    if (!Array.isArray(values)) continue;
    migrated.predictions[id]={};
    ['carlinhos','tiba'].forEach((name,i)=>{ const pair=values.slice(i*2,i*2+2); if(validPair(pair)) migrated.predictions[id][name]=pair; });
    const result=values.slice(4,6); if(validPair(result)) migrated.results[id]=result;
  }
  return migrated;
}
function loadState() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed=JSON.parse(saved);
      if (!validateState(parsed)) throw new Error('Formato do histórico inválido');
      parsed.teamLineups??={};
      return parsed;
    }
    const old=JSON.parse(localStorage.getItem('catimba') || '{}');
    return isRecord(old)?migrateLegacy(old):blankState();
  } catch {
    try { const raw=localStorage.getItem(KEY)||localStorage.getItem('catimba'); if(raw) localStorage.setItem(`catimba:recovery:${Date.now()}`,raw); } catch {}
    recoverWarning('Não foi possível ler o histórico anterior. Uma cópia de recuperação foi preservada quando possível. Você pode restaurar um arquivo exportado.');
    return blankState();
  }
}
let state=loadState();
function syncLegacyFixture() {
  const previous=fixtures.findIndex(game=>game.id==='legacy:37-0');
  if(previous!==-1)fixtures.splice(previous,1);
  if (state.legacy['37-0']) fixtures.push({id:'legacy:37-0',competition:'brasileirao',season:'2026',round:'archive',home:'Atlético-MG',away:'Corinthians',stadium:'Confronto provisório da versão anterior',kickoff:null,archived:true});
}
syncLegacyFixture();
function persist(message='Salvo automaticamente neste navegador.') {
  state.updatedAt=new Date().toISOString();
  try { localStorage.setItem(KEY,JSON.stringify(state)); $('status').textContent=message; return true; }
  catch { $('status').textContent='Não foi possível salvar. Exporte o histórico para guardar seus palpites.'; return false; }
}
function element(tag,text,className) { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(className) node.className=className; return node; }
function currentFixtures() { return fixtures.filter(g=>g.competition===$('competition').value&&g.season===$('season').value&&g.round===$('round').value); }
function renderRounds() {
  const current=$('round').value;
  const rounds=[...new Set(fixtures.filter(g=>g.competition===$('competition').value&&g.season===$('season').value).map(g=>g.round))];
  $('round').replaceChildren();
  for(const round of rounds) { const option=element('option',round==='final'?'Final':round==='archive'?'Histórico provisório':`${round}ª rodada`); option.value=round; $('round').append(option); }
  if (!rounds.length) { const option=element('option','Aguardando calendário'); option.value=''; $('round').append(option); }
  $('round').disabled=!rounds.length;
  $('round').value=rounds.includes(current)?current:rounds.includes('38')?'38':rounds[0]||'';
}
function renderRanking() {
  const totals=state.participants.map(p=>({name:p.name,points:0}));
  for(const game of fixtures.filter(g=>!g.archived)) {
    const result=state.results[game.id]; if(!completePair(result)) continue;
    state.participants.forEach((p,i)=>{
      const pick=state.predictions[game.id]?.[p.id]; if(!completePair(pick)) return;
      totals[i].points+=pick[0]===result[0]&&pick[1]===result[1]?3:Math.sign(pick[0]-pick[1])===Math.sign(result[0]-result[1])?1:0;
    });
  }
  $('ranking').replaceChildren(...totals.sort((a,b)=>b.points-a.points).map(p=>{const item=element('div',p.name,'ranking-item');item.append(element('strong',`${p.points} pts`));return item;}));
}
function scoreRow(game,participant) {
  const label=element('div',undefined,`score-row${participant?'':' result-row'}`);
  const who=participant?.name||'Resultado · 90 minutos';
  label.append(element('span',who));
  const inputs=element('span',undefined,'score-inputs');
  const pair=participant?state.predictions[game.id]?.[participant.id]:state.results[game.id];
  [game.home,game.away].forEach((team,i)=>{
    if(i) inputs.append(element('span','×'));
    const input=element('input'); input.type='number';input.min='0';input.max='99';input.step='1';input.inputMode='numeric';input.value=pair?.[i]??'';
    input.setAttribute('aria-label',`${who}: ${team} (${game.round==='final'?'final':game.round+'ª rodada'})`);
    input.addEventListener('input',()=>{
      input.setCustomValidity('');
      if(!input.validity.valid) { input.setCustomValidity('Use um número inteiro de 0 a 99.');input.reportValidity();return; }
      const value=input.value===''?null:Number(input.value);
      if(!validScore(value)) return;
      let target;
      if(participant) { state.predictions[game.id]??={};target=state.predictions[game.id][participant.id]??=[null,null]; }
      else target=state.results[game.id]??=[null,null];
      target[i]=value; persist();renderRanking();
    });
    inputs.append(input);
  });
  label.append(inputs);return label;
}
function dateLabel(value,zone) { return new Intl.DateTimeFormat('pt-BR',{timeZone:zone,dateStyle:'short',timeStyle:'short'}).format(new Date(value)); }
function renderChampions() {
  $('champion-section').hidden=!($('competition').value==='libertadores'&&$('season').value==='2026');
  $('final-preview').hidden=$('champion-section').hidden;
  $('champion-picks').replaceChildren(...state.participants.map(p=>{
    const label=element('label',p.name,'champion-row'),select=element('select');select.setAttribute('aria-label',`Campeão da Libertadores · ${p.name}`);
    for(const team of ['','Palmeiras','Estudiantes']) { const option=element('option',team||'Escolha seu campeão');option.value=team;select.append(option); }
    select.value=state.champions[p.id]||'';select.onchange=()=>{state.champions[p.id]=select.value;persist();};label.append(select);return label;
  }));
}
function renderGames() {
  const all=currentFixtures(),query=normal($('search').value);
  const games=all.filter(g=>normal(`${g.home} ${g.away}`).includes(query));
  $('games').replaceChildren();$('fixture-info').replaceChildren();
  if(all.length) {
    const source=element('a',all[0].archived?'':'Calendário conferido em fonte oficial');source.href=$('competition').value==='libertadores'?PALMEIRAS_SOURCE:CBF_SOURCE;source.target='_blank';source.rel='noopener noreferrer';
    if(all[0].archived) $('fixture-info').textContent='Arquivo dos palpites da versão anterior. Este confronto provisório não pertence à tabela oficial da 37ª rodada e não entra na pontuação.';
    else { $('fixture-info').append(source,document.createTextNode(' · Conferido em 27/11/2026. Horários abaixo em Brasília e Lisboa.')); }
  } else $('fixture-info').textContent=`${names[$('competition').value]} ${$('season').value}: os jogos ainda não foram cadastrados e conferidos no Catimba. O calendário será incluído após a conferência da fonte oficial.`;
  $('count').textContent=all.length?`${games.length} de ${all.length} jogo${all.length===1?'':'s'}${$('round').value==='38'?' · 20 times na rodada':''}`:'Aguardando jogos conferidos';
  for(const game of games) {
    const article=element('article');article.dataset.matchId=game.id;article.append(element('h3',`${game.home} × ${game.away}`));
    article.append(element('p',game.kickoff?`${dateLabel(game.kickoff,'America/Sao_Paulo')} (Brasília) · ${dateLabel(game.kickoff,'Europe/Lisbon')} (Lisboa) · ${game.stadium}`:game.stadium,'match-meta'));
    state.participants.forEach(p=>article.append(scoreRow(game,p)));article.append(scoreRow(game,null));$('games').append(article);
  }
  if(!games.length) $('games').append(element('p',all.length?'Nenhum jogo encontrado. Tente outro nome de time.':'Assim que os confrontos forem conferidos, os campos para palpitar aparecerão aqui.','empty'));
  renderChampions();renderRanking();
}
function renderPitch() { mountPitch($('pitch'),{participants:state.participants,lineups:state.lineups,onSave:(id,lineup)=>{state.lineups[id]=lineup;return persist('Campinho salvo neste navegador.');}}); }
function renderMatchPitches() {
  mountMatchPitches($('match-pitches'),finalLineups,{competitionLabel:'FINAL · LIBERTADORES 2026',kickoffLabel:'CENTENÁRIO · 28/11 · 17H BR | 20H PT',participants:state.participants,edits:state.teamLineups,onSave:(id,team,lineup)=>{
    const candidate={...state,teamLineups:{...state.teamLineups,[id]:{...state.teamLineups[id],[team]:lineup}}};
    if(!validateState(candidate))return false;
    state.teamLineups[id]??={};state.teamLineups[id][team]=lineup;return persist('Escalação da final salva neste navegador.');
  }});
}
function renderOriginalLineups() {
  $('original-lineups').replaceChildren(...finalLineups.map(team=>{
    const card=element('article');
    card.append(element('h4',`${team.name} · ${team.formation}`),element('p',`Treinador: ${team.coach}`),element('p',team.players.map(player=>player.name).join('; ')+'.'));
    const source=element('a',team.sourceLabel);source.href=team.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';card.append(source);return card;
  }));
}
$('guest-form').onsubmit=event=>{
  event.preventDefault();const name=$('guest-name').value.trim().replace(/\s+/g,' ');
  if(!name||state.participants.some(p=>normal(p.name)===normal(name))) { $('guest-status').textContent='Digite um nome diferente dos participantes já cadastrados.';return; }
  if(state.participants.length>=100) {$('guest-status').textContent='Limite de 100 participantes atingido.';return;}
  state.participants.push({id:`guest-${crypto.randomUUID()}`,name});const saved=persist();$('guest-name').value='';$('guest-status').textContent=saved?`${name} entrou no Catimba. Já pode palpitar e montar seu campinho.`:`${name} foi adicionado, mas não foi possível salvar. Exporte uma cópia.`;renderGames();renderPitch();renderMatchPitches();
};
$('search').oninput=renderGames;$('round').onchange=renderGames;
$('competition').onchange=$('season').onchange=()=>{renderRounds();renderGames();refreshStandings();};
$('save').onclick=()=>persist('Palpites e campinhos salvos neste navegador.');
$('export').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const anchor=element('a');anchor.href=url;anchor.download=`catimba-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('backup-status').textContent='Histórico exportado com palpites, campeões, convidados e campinhos.';
};
$('import').onchange=async()=>{
  const file=$('import').files[0];if(!file)return;
  try {
    if(file.size>5_000_000)throw new Error('large');
    let imported=JSON.parse(await file.text());
    if(isRecord(imported)&&imported.version===undefined&&Object.keys(imported).length&&Object.entries(imported).every(([key,values])=>/^\d+-\d+$/.test(key)&&Array.isArray(values)&&values.length===6&&values.every(validScore)))imported=migrateLegacy(imported);
    if(!validateState(imported))throw new Error('format');
    imported.teamLineups??={};
    localStorage.setItem(`catimba:before-import:${Date.now()}`,JSON.stringify(state));
    localStorage.setItem(KEY,JSON.stringify(imported));state=imported;syncLegacyFixture();$('backup-status').textContent='Histórico restaurado. A versão anterior ficou guardada neste navegador.';renderRounds();renderGames();renderPitch();renderMatchPitches();
  } catch { $('backup-status').textContent='Não foi possível restaurar. Use um arquivo de histórico do Catimba exportado nesta versão. Seus palpites atuais foram mantidos.'; }
  $('import').value='';
};

let standingsRequest=0;
function collectTables(node,season) {
  const tables=[];
  if(node.standings?.entries?.length&&String(node.standings.season)===season)tables.push({name:node.name||'',entries:node.standings.entries});
  if(node.entries?.length&&String(node.season)===season)tables.push({name:node.name||'',entries:node.entries});
  for(const child of node.children||[])tables.push(...collectTables(child,season));
  return tables;
}
function renderStandings(tables) {
  $('standings').replaceChildren();
  for(const group of tables) {
    if(tables.length>1)$('standings').append(element('h3',group.name||'Grupo'));
    const table=element('table'),caption=element('caption',`${names[$('competition').value]} ${$('season').value}${tables.length>1?' · '+group.name:''}`),thead=element('thead'),header=element('tr');
    ['Pos.','Time','Pts','J','V','E','D','SG'].forEach(h=>{const th=element('th',h);th.scope='col';header.append(th);});thead.append(header);table.append(caption,thead);
    const body=element('tbody');
    group.entries.forEach((entry,i)=>{
      const stats=Object.fromEntries((entry.stats||[]).map(stat=>[stat.name,stat.displayValue??stat.value]));
      const row=element('tr');[stats.rank??i+1,entry.team?.displayName||entry.team?.name||'—',stats.points,stats.gamesPlayed,stats.wins,stats.ties,stats.losses,stats.pointDifferential??stats.goalDifference].forEach(value=>row.append(element('td',value===undefined?'—':String(value))));body.append(row);
    });table.append(body);$('standings').append(table);
  }
}
async function refreshStandings() {
  const request=++standingsRequest,competition=$('competition').value,season=$('season').value;
  $('standings').replaceChildren();$('standings-source').replaceChildren();
  if(competition==='libertadores'&&season==='2026') {
    $('standings-status').textContent='Final em jogo único: Palmeiras × Estudiantes, em 28/11/2026. Dê seu palpite de placar e campeão acima.';
    const source=element('a','Conferir a final no site oficial do Palmeiras');source.href=PALMEIRAS_SOURCE;source.target='_blank';source.rel='noopener noreferrer';$('standings-source').append(source);$('refresh-standings').disabled=false;return;
  }
  const url=`https://site.web.api.espn.com/apis/v2/sports/soccer/${leagues[competition]}/standings?season=${season}`;
  const cacheKey=`catimba:standings:${competition}:${season}`;
  $('standings-status').textContent=`Consultando ${names[competition]} ${season}…`;$('refresh-standings').disabled=true;
  const source=element('a','Fonte da classificação: ESPN');source.href=`https://www.espn.com.br/futebol/classificacao/_/liga/${leagues[competition]}/temporada/${season}`;source.target='_blank';source.rel='noopener noreferrer';$('standings-source').append(source);
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('http');
    const data=await response.json();
    if(String(data.season?.year??data.season)!==season)throw new Error('season');
    const tables=collectTables(data,season);if(!tables.length)throw new Error('empty');
    if(request!==standingsRequest)return;
    const fetchedAt=new Date().toISOString();renderStandings(tables);
    $('standings-status').textContent=`Classificação ${season} consultada em ${dateLabel(fetchedAt,'Europe/Lisbon')} (Lisboa).`;
    try{localStorage.setItem(cacheKey,JSON.stringify({season,tables,fetchedAt}));}catch{}
  } catch {
    if(request!==standingsRequest)return;
    let cache;try{cache=JSON.parse(localStorage.getItem(cacheKey));}catch{}
    if(cache?.season===season&&Array.isArray(cache.tables)&&cache.tables.length&&Number.isFinite(Date.parse(cache.fetchedAt))) {
      renderStandings(cache.tables);$('standings-status').textContent=`Sem conexão com a fonte agora. Exibindo cópia de ${dateLabel(cache.fetchedAt,'Europe/Lisbon')} (Lisboa). Tente atualizar.`;
    } else $('standings-status').textContent=season==='2027'?'A fonte ainda não forneceu uma classificação válida de 2027. Atualize quando a temporada estiver disponível.':'Não foi possível consultar a classificação agora. Tente atualizar ou abra o link da fonte abaixo.';
  } finally { if(request===standingsRequest)$('refresh-standings').disabled=false; }
}
$('refresh-standings').onclick=refreshStandings;
renderOriginalLineups();renderMatchPitches();
renderRounds();renderGames();renderPitch();refreshStandings();
