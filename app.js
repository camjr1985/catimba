import { mountPitch } from './campinho.js';
import { mountMatchPitches } from './match-pitches.js?v=20261127-arraste';
import { finalLineups } from './lineups.js';
import { mountTitlePicks } from './title-picks.js?v=20261128-digitacao';
import { fetchMatchResults } from './match-results.js?v=20261128-automatico';
import { automaticScore,scorePredictions } from './prediction-scoring.js?v=20261128-automatico';
import { startAutoRefresh } from './auto-refresh.js?v=20261128-automatico';
import { projectZones } from './standings-zones.js?v=20261128-tabela';
import { projectStandings } from './standings-projection.js?v=20261128-tabela';
import { enhanceScoreInput } from './score-input.js?v=20261128-digitacao';

const $ = id => document.getElementById(id);
const KEY = 'catimba:v2';
const CBF_SOURCE = 'https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro/campeonato-brasileiro-serie-a/cbf-publica-tabela-detalhada-das-duas-rodadas-finais-do-brasileirao';
const PALMEIRAS_SOURCE = 'https://palmeiras.com.br/jogo/?idjogo=5307';
const COPA_SOURCE = 'https://www.cbf.com.br/futebol-brasileiro/noticias/copa-brasil/copa-brasil-masculino/gremio-e-palmeiras-decidem-copa-do-brasil-2026-no-dia-6-de-dezembro-as-16-h';
const names = {brasileirao:'Brasileirão Série A',libertadores:'Libertadores','copa-brasil':'Copa do Brasil',carioca:'Campeonato Carioca',paulista:'Campeonato Paulista'};
const leagues = {brasileirao:'bra.1',libertadores:'conmebol.libertadores','copa-brasil':'bra.copa_do_brazil',carioca:'bra.camp.carioca',paulista:'bra.camp.paulista'};
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
  {id:'libertadores:2026:final:palmeiras-estudiantes',competition:'libertadores',season:'2026',round:'final',home:'Palmeiras',away:'Estudiantes',stadium:'Centenário, Montevidéu',kickoff:'2026-11-28T17:00:00-03:00'},
  {id:'copa-brasil:2026:final:gremio-palmeiras',competition:'copa-brasil',season:'2026',round:'final',home:'Grêmio',away:'Palmeiras',stadium:'Arena Mané Garrincha, Brasília',kickoff:'2026-12-06T16:00:00-03:00'}
];
const brazilTeams2026=[...new Set(fixtures.filter(game=>game.competition==='brasileirao'&&game.round==='38').flatMap(game=>[game.home,game.away]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
const blankState = () => ({version:2,participants:[{id:'carlinhos',name:'Carlinhos'},{id:'tiba',name:'Tiba'}],predictions:{},results:{},champions:{},tournamentChampions:{},lineups:{},teamLineups:{},legacy:{},updatedAt:null});
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
  if(value.tournamentChampions!==undefined) {
    if(!isRecord(value.tournamentChampions))return false;
    for(const [competition,picks] of Object.entries(value.tournamentChampions)) {
      if(!/^(brasileirao|libertadores|copa-brasil):202[67]$/.test(competition)||!isRecord(picks))return false;
      for(const [id,team] of Object.entries(picks)) {
        if(!ids.has(id)||typeof team!=='string'||team.length>80)return false;
        if(competition==='brasileirao:2026'&&!['',...brazilTeams2026].includes(team))return false;
        if(competition==='copa-brasil:2026'&&!['','Grêmio','Palmeiras'].includes(team))return false;
      }
    }
  }
  for (const [id,lineup] of Object.entries(value.lineups)) if (!ids.has(id)||!isRecord(lineup)||typeof lineup.teamName!=='string'||lineup.teamName.length>100||!Array.isArray(lineup.players)||lineup.players.length!==11||lineup.players.some(name=>typeof name!=='string'||name.length>100)) return false;
  if(value.teamLineups!==undefined) {
    if(!isRecord(value.teamLineups))return false;
    for(const [id,teams] of Object.entries(value.teamLineups)) {
      if(!ids.has(id)||!isRecord(teams))return false;
      for(const [team,lineup] of Object.entries(teams)) {
        if(!['Palmeiras','Estudiantes'].includes(team)||!isRecord(lineup)||typeof lineup.formation!=='string'||lineup.formation.length>50||!Array.isArray(lineup.players)||lineup.players.length!==11)return false;
        if(lineup.players.some(player=>!isRecord(player)||typeof player.name!=='string'||!player.name.trim()||player.name.length>100||typeof player.position!=='string'||player.position.length>100||!Number.isInteger(player.row)||player.row<0||player.row>3))return false;
        for(const player of lineup.players) {
          const hasX=Object.hasOwn(player,'x'),hasY=Object.hasOwn(player,'y');
          if(hasX!==hasY)return false;
          if(hasX&&(!Number.isFinite(player.x)||!Number.isFinite(player.y)||player.x<0||player.x>100||player.y<0||player.y>100))return false;
        }
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
      parsed.tournamentChampions??={};
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
let titlePicksView=null,officialResults={},latestStandingsTables=[];
let resultsRequest=0;
let autoRefreshController=null,officialViewsPending=false;
const scoreControls=new WeakMap();
let scorePreviewTimer;
let standingsRenderPending=false;
function requestStandingsRender() {
  if(!latestStandingsTables.length)return;
  if(document.activeElement?.classList.contains('catimba-score-input')){standingsRenderPending=true;return;}
  renderStandings(latestStandingsTables);
}
function refreshScorePreviews() {
  clearTimeout(scorePreviewTimer);
  scorePreviewTimer=setTimeout(()=>{
    // Keep editing steady while derived tables above the form are refreshed.
    // The new values are saved immediately; previews wait until focus leaves scores.
    if(document.activeElement?.classList.contains('catimba-score-input'))return;
    if(officialViewsPending)applyOfficialViews();
    else{renderRanking();renderBoardResults();}
    if(latestStandingsTables.length&&(standingsRenderPending||$('standings-view').value!=='real'))renderStandings(latestStandingsTables);
  },120);
}
function nextGameScore(input) {
  const candidates=[...$('games').querySelectorAll('input')].filter(field=>field.dataset.participantId===input.dataset.participantId);
  const next=candidates[candidates.indexOf(input)+1];
  if(next)next.focus();else input.blur();
}
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
  const {totals,countedMatches,pendingMatches,cachedMatches}=scorePredictions(state.participants,fixtures,state.predictions,officialResults);
  $('ranking').replaceChildren(...totals.map(p=>{const item=element('div',p.name,'ranking-item');item.append(element('strong',`${p.points} pts`));return item;}));
  $('ranking-status').textContent=`Pontuação automática: ${countedMatches} jogo${countedMatches===1?'':'s'} com placar de 90 minutos confirmado.${pendingMatches?` ${pendingMatches} partida${pendingMatches===1?' concluída aguarda':'s concluídas aguardam'} a confirmação dos 90 minutos na fonte.`:''}${cachedMatches?` ${cachedMatches} resultado${cachedMatches===1?' vem':'s vêm'} da última cópia guardada.`:''}`;
}
function scoreRow(game,participant) {
  const label=element('div',undefined,'score-row');
  const who=participant.name;
  label.append(element('span',who));
  const inputs=element('span',undefined,'score-inputs');
  const pair=state.predictions[game.id]?.[participant.id];
  [game.home,game.away].forEach((team,i)=>{
    if(i) inputs.append(element('span','×'));
    const goalLabel=element('label',undefined,'score-team');goalLabel.append(element('span',team,'score-team-name'));
    const input=element('input');input.value=pair?.[i]??'';
    input.dataset.matchId=game.id;input.dataset.participantId=participant.id;input.dataset.scoreIndex=String(i);
    input.setAttribute('aria-label',`${who}: ${team} (${game.round==='final'?'final':game.round+'ª rodada'})`);
    goalLabel.append(input);inputs.append(goalLabel);
    const control=enhanceScoreInput(input,{onValue:value=>{
      state.predictions[game.id]??={};
      const target=state.predictions[game.id][participant.id]??=[null,null];
      target[i]=value;persist();
      titlePicksView?.setScore(participant.id,game.id,i,value);
    },onCommit:refreshScorePreviews,onNext:()=>nextGameScore(input)});
    scoreControls.set(input,control);
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
    select.value=state.champions[p.id]||'';select.onchange=()=>{state.champions[p.id]=select.value;persist();titlePicksView?.setPick(p.id,'libertadores:2026',select.value);};label.append(select);return label;
  }));
}
function renderGames() {
  const all=currentFixtures(),query=normal($('search').value);
  const games=all.filter(g=>normal(`${g.home} ${g.away}`).includes(query));
  $('games').replaceChildren();$('fixture-info').replaceChildren();
  if(all.length) {
    const source=element('a',all[0].archived?'':'Calendário conferido em fonte oficial');source.href=$('competition').value==='libertadores'?PALMEIRAS_SOURCE:$('competition').value==='copa-brasil'?COPA_SOURCE:CBF_SOURCE;source.target='_blank';source.rel='noopener noreferrer';
    if(all[0].archived) $('fixture-info').textContent='Arquivo dos palpites da versão anterior. Este confronto provisório não pertence à tabela oficial da 37ª rodada e não entra na pontuação.';
    else { $('fixture-info').append(source,document.createTextNode(' · Conferido em 27/11/2026. Horários abaixo em Brasília e Lisboa.')); }
  } else $('fixture-info').textContent=`${names[$('competition').value]} ${$('season').value}: os jogos ainda não foram cadastrados e conferidos no Catimba. O calendário será incluído após a conferência da fonte oficial.`;
  $('count').textContent=all.length?`${games.length} de ${all.length} jogo${all.length===1?'':'s'}${$('round').value==='38'?' · 20 times na rodada':''}`:'Aguardando jogos conferidos';
  for(const game of games) {
    const article=element('article');article.dataset.matchId=game.id;article.append(element('h3',`${game.home} × ${game.away}`));
    article.append(element('p',game.kickoff?`${dateLabel(game.kickoff,'America/Sao_Paulo')} (Brasília) · ${dateLabel(game.kickoff,'Europe/Lisbon')} (Lisboa) · ${game.stadium}`:game.stadium,'match-meta'));
    const actual=element('div',undefined,'official-result');actual.dataset.officialMatch=game.id;article.append(actual);
    state.participants.forEach(p=>article.append(scoreRow(game,p)));$('games').append(article);
  }
  if(!games.length) $('games').append(element('p',all.length?'Nenhum jogo encontrado. Tente outro nome de time.':'Assim que os confrontos forem conferidos, os campos para palpitar aparecerão aqui.','empty'));
  renderChampions();renderRanking();renderOfficialBlocks();
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
function boardFinals() {
  return fixtures.filter(game=>game.round==='final'&&game.season===$('standings-season').value).map(game=>({
    id:game.id,title:names[game.competition],home:game.home,away:game.away,
    kickoffText:`${dateLabel(game.kickoff,'America/Sao_Paulo')} (Brasília) · ${dateLabel(game.kickoff,'Europe/Lisbon')} (Lisboa)`,
    predictions:state.predictions[game.id]||{},
    officialText:finalResultText(officialResults[game.id]),
    winnerText:officialResults[game.id]?.winnerText||'',
    officialScore:automaticScore(officialResults[game.id])||[null,null],
    completed:officialResults[game.id]?.completed===true,
    regulationConfirmed:officialResults[game.id]?.regulationConfirmed===true,
    winner:officialResults[game.id]?.winner||null,
    sourceUrl:officialResults[game.id]?.sourceUrl||(game.competition==='copa-brasil'?COPA_SOURCE:PALMEIRAS_SOURCE)
  }));
}
function finalResultText(actual) {
  if(!actual)return 'Agendado · resultado ainda não definido';
  const score=automaticScore(actual);
  const text=score&&(/pênaltis|prorrogação/i.test(actual.officialText)||actual.homeScore!==score[0]||actual.awayScore!==score[1])?`${actual.officialText} · 90 minutos: ${score[0]} × ${score[1]}`:actual.officialText;
  return actual.regulationStale?`${text} · confirmação dos 90 minutos na última cópia guardada`:text;
}
function renderTitlePicks() {
  const season=$('standings-season').value;
  const competitions=[
    {key:`brasileirao:${season}`,label:'Brasileirão',teams:season==='2026'?brazilTeams2026:[]},
    {key:`libertadores:${season}`,label:'Libertadores',teams:season==='2026'?['Palmeiras','Estudiantes']:[],champion:season==='2026'?officialResults['libertadores:2026:final:palmeiras-estudiantes']?.winner:null},
    {key:`copa-brasil:${season}`,label:'Copa do Brasil',teams:season==='2026'?['Grêmio','Palmeiras']:[],champion:season==='2026'?officialResults['copa-brasil:2026:final:gremio-palmeiras']?.winner:null}
  ].map(item=>({...item,picks:item.key==='libertadores:2026'?state.champions:state.tournamentChampions[item.key]||{}}));
  titlePicksView=mountTitlePicks($('title-picks'),{season,participants:state.participants,competitions,finals:boardFinals(),
    onCommit:refreshScorePreviews,
    onPick:(id,key,value)=>{
      if(key==='libertadores:2026'){state.champions[id]=value;renderChampions();}
      else{state.tournamentChampions[key]??={};state.tournamentChampions[key][id]=value;}
      return persist('Palpite de campeão salvo neste navegador.');
    },
    onScore:(id,matchId,index,value)=>{
      state.predictions[matchId]??={};state.predictions[matchId][id]??=[null,null];state.predictions[matchId][id][index]=value;
      for(const input of $('games').querySelectorAll('input'))if(input.dataset.matchId===matchId&&input.dataset.participantId===id&&Number(input.dataset.scoreIndex)===index)scoreControls.get(input)?.setValue(value);
      refreshScorePreviews();return persist('Palpite de placar salvo neste navegador.');
    }
  });
}
function boardRoundFixtures() {
  return fixtures.filter(game=>game.competition==='brasileirao'&&game.season===$('standings-season').value&&game.round===$('board-round').value);
}
function renderComparisonPeople() {
  const selected=$('comparison-person').value;
  $('comparison-person').replaceChildren(...state.participants.map(person=>{const option=element('option',person.name);option.value=person.id;return option;}));
  $('comparison-person').value=state.participants.some(person=>person.id===selected)?selected:state.participants[0].id;
}
function renderOfficialBlocks() {
  for(const target of document.querySelectorAll('[data-official-match]')) {
    const game=fixtures.find(game=>game.id===target.dataset.officialMatch),actual=officialResults[game?.id];
    target.replaceChildren();if(!game||game.archived){target.hidden=true;continue;}target.hidden=false;
    target.append(element('strong',actual?.officialText||'Resultado da partida: aguardando consulta da fonte.'));
    const score=automaticScore(actual);
    if(score)target.append(element('div',`Resultado automático · 90 minutos: ${game.home} ${score[0]} × ${score[1]} ${game.away}`));
    else if(actual?.completed)target.append(element('div','Aguardando a confirmação automática do placar dos 90 minutos.'));
    if(actual?.regulationStale&&actual.regulationFetchedAt)target.append(element('small',`Confirmação dos 90 minutos: cópia de ${dateLabel(actual.regulationFetchedAt,'Europe/Lisbon')} (Lisboa).`));
    if(actual?.winnerText)target.append(element('div',actual.winnerText));
    if(actual?.fetchedAt)target.append(element('small',`${actual.stale?'Cópia guardada':'Fonte consultada'} em ${dateLabel(actual.fetchedAt,'Europe/Lisbon')} (Lisboa).`));
    if(actual?.sourceUrl){const link=element('a','Conferir resultado na fonte');link.href=actual.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';target.append(link);}
  }
}
function renderBoardResults() {
  const games=boardRoundFixtures();$('board-results').replaceChildren();
  for(const game of games){
    const card=element('article',undefined,'board-result');card.append(element('h4',`${game.home} × ${game.away}`));
    const actual=officialResults[game.id];
    card.append(element('p',actual?.officialText||`${dateLabel(game.kickoff,'America/Sao_Paulo')} (Brasília) · aguardando consulta`));
    const score=automaticScore(actual);
    for(const person of state.participants){const pick=state.predictions[game.id]?.[person.id];if(!completePair(pick))continue;const exact=score&&pick[0]===score[0]&&pick[1]===score[1];card.append(element('p',`${person.name}: ${pick[0]} × ${pick[1]}${score?(exact?' · acertou o placar':' · placar diferente do real'):''}`,'board-pick'));}
    if(actual?.stale)card.append(element('p','Cópia guardada da última consulta.','muted'));
    if(actual?.sourceUrl){const link=element('a','Conferir resultado');link.href=actual.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}
    $('board-results').append(card);
  }
  if(!games.length)$('board-results').append(element('p','Jogos desta temporada ainda aguardam cadastro e conferência.','muted'));
}
async function refreshOfficialResults({force=false}={}) {
  const request=++resultsRequest;
  const relevant=fixtures.filter(game=>!game.archived);
  $('results-status').textContent='Consultando os resultados das partidas…';
  try {
    const data=await fetchMatchResults(relevant,{force});if(request!==resultsRequest)return;
    officialResults={...officialResults,...data.results};
    $('results-status').textContent=data.errors.length?'Algumas consultas estão indisponíveis. Cópias anteriores, quando disponíveis, estão identificadas.':`Resultados consultados em ${dateLabel(data.fetchedAt,'Europe/Lisbon')} (Lisboa).`;
    $('auto-results-status').textContent=`Resultados automáticos · consulta em ${dateLabel(data.fetchedAt,'Europe/Lisbon')} (Lisboa).${data.errors.length?' Alguns jogos aguardam atualização da fonte.':''} Nova consulta a cada minuto enquanto esta aba estiver visível.`;
  } catch {if(request!==resultsRequest)return;$('results-status').textContent='Não foi possível consultar os resultados agora. Haverá nova tentativa automática.';$('auto-results-status').textContent='Fonte indisponível agora. O Catimba tentará buscar os resultados automaticamente de novo.';}
  applyOfficialViews();
}
function applyOfficialViews() {
  if(document.activeElement?.classList.contains('catimba-score-input')){officialViewsPending=true;return;}
  officialViewsPending=false;
  renderOfficialBlocks();renderBoardResults();renderRanking();titlePicksView?.updateOfficialResults(boardFinals());
  titlePicksView?.updateChampions([{key:'libertadores:2026',champion:officialResults['libertadores:2026:final:palmeiras-estudiantes']?.winner||null},{key:'copa-brasil:2026',champion:officialResults['copa-brasil:2026:final:gremio-palmeiras']?.winner||null}]);
  requestStandingsRender();
}
function setRecordingMode(enabled) {
  document.body.classList.toggle('is-recording-mode',enabled);$('recording-mode').setAttribute('aria-pressed',String(enabled));
  $('recording-mode').textContent=enabled?'Sair da gravação':'Modo gravação';
  if(enabled)$('standings-board').scrollIntoView({block:'start',behavior:'instant'});
}
$('recording-mode').onclick=()=>setRecordingMode(!document.body.classList.contains('is-recording-mode'));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('is-recording-mode'))setRecordingMode(false);});
$('guest-form').onsubmit=event=>{
  event.preventDefault();const name=$('guest-name').value.trim().replace(/\s+/g,' ');
  if(!name||state.participants.some(p=>normal(p.name)===normal(name))) { $('guest-status').textContent='Digite um nome diferente dos participantes já cadastrados.';return; }
  if(state.participants.length>=100) {$('guest-status').textContent='Limite de 100 participantes atingido.';return;}
  state.participants.push({id:`guest-${crypto.randomUUID()}`,name});const saved=persist();$('guest-name').value='';$('guest-status').textContent=saved?`${name} entrou no Catimba. Já pode palpitar e montar seu campinho.`:`${name} foi adicionado, mas não foi possível salvar. Exporte uma cópia.`;renderGames();renderPitch();renderMatchPitches();renderTitlePicks();renderComparisonPeople();if(latestStandingsTables.length)renderStandings(latestStandingsTables);
};
$('search').oninput=renderGames;$('round').onchange=()=>{renderGames();refreshOfficialResults();};
$('competition').onchange=$('season').onchange=()=>{renderRounds();renderGames();refreshOfficialResults();};
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
    imported.tournamentChampions??={};
    localStorage.setItem(`catimba:before-import:${Date.now()}`,JSON.stringify(state));
    localStorage.setItem(KEY,JSON.stringify(imported));state=imported;syncLegacyFixture();$('backup-status').textContent='Histórico restaurado. A versão anterior ficou guardada neste navegador.';renderRounds();renderGames();renderPitch();renderMatchPitches();renderTitlePicks();renderComparisonPeople();if(latestStandingsTables.length)renderStandings(latestStandingsTables);
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
  standingsRenderPending=false;
  $('standings').replaceChildren();
  const season=$('standings-season').value,view=$('standings-view').value;
  const participant=state.participants.find(person=>person.id===$('comparison-person').value)||state.participants[0];
  $('comparison-person-label').hidden=view==='real';
  $('comparison-status').hidden=view==='real';
  $('standings-title').textContent=view==='real'?`Classificação real do Brasileirão Série A · ${season}`:`${view==='comparison'?'Tabela real × palpites':'Tabela dos palpites'} · ${participant.name} · ${season}`;
  $('zone-legend').replaceChildren();
  if(season==='2026')for(const [label,type] of [['Libertadores','libertadores'],['Sul-Americana','sulamericana'],['Vagas dependentes das finais','pending'],['Copa do Brasil · indicação adicional','copa'],['Rebaixamento','relegation']])$('zone-legend').append(element('span',label,`zone-key zone-key--${type}`));
  const zoneOptions={season,libertadoresWinner:officialResults['libertadores:2026:final:palmeiras-estudiantes']?.winner||null,copaWinner:officialResults['copa-brasil:2026:final:gremio-palmeiras']?.winner||null};
  function zoneCell(zone) {
    const cell=element('td',undefined,'standing-zone');cell.append(element('span',zone?.label||'Critérios de vagas a conferir'));
    if(zone?.copa2027){const badge=element('span','CdB 2027','copa-badge');badge.title='Projeção de participação via permanência na Série A; sobrepõe-se às vagas continentais.';cell.append(badge);}
    return cell;
  }
  for(const group of tables) {
    if(tables.length>1)$('standings').append(element('h3',group.name||'Grupo'));
    const rows=group.entries.map((entry,i)=>{const stats=Object.fromEntries((entry.stats||[]).map(stat=>[stat.name,stat.value??stat.displayValue]));return{teamName:entry.team?.displayName||entry.team?.name||'—',rank:Number(stats.rank??i+1),stats};}).sort((a,b)=>a.rank-b.rank);
    const projection=view==='real'?null:projectStandings(rows,{fixtures,predictions:state.predictions,participantId:participant.id,officialResults,season});
    const projectedRows=projection?.rows||rows;
    const realZones=projectZones(rows,zoneOptions),predictedZones=projectZones(projectedRows,zoneOptions);
    const table=element('table',undefined,view==='comparison'?'comparison-table':''),caption=element('caption',view==='real'?`Tabela real · Brasileirão Série A ${season}`:`${view==='comparison'?'Comparação com a tabela real':'Simulação dos palpites'} · ${participant.name}`),thead=element('thead'),header=element('tr');
    const labels=view==='comparison'?['Time','Pos. real','Pos. palpite','Pts reais','Pts palpite','Dif. pts','Vagas · tabela real','Vagas · palpites']:['Pos.','Time','Pts','J','V','E','D','SG','Vagas · projeção'];
    labels.forEach(h=>{const th=element('th',h);th.scope='col';header.append(th);});thead.append(header);table.append(caption,thead);
    const body=element('tbody');
    const displayRows=view==='real'?rows:projectedRows;
    for(const item of displayRows){
      const {rank,teamName,stats}=item,zone=(view==='real'?realZones:predictedZones)[teamName],row=element('tr',undefined,zone?`zone-${zone.type}`:undefined);
      const actual=rows.find(real=>real.teamName===teamName);
      if(view==='comparison'){
        const diff=Number(stats.points)-Number(actual.stats.points),movement=actual.rank-rank;
        [teamName,actual.rank,`${rank}${item.tied?'*':''}${movement?` (${movement>0?'↑':'↓'}${Math.abs(movement)})`:''}`,actual.stats.points,stats.points,`${diff>0?'+':''}${diff}`].forEach(value=>row.append(element('td',String(value))));
        row.append(zoneCell(realZones[teamName]),zoneCell(zone));
      }else{
        [view==='projection'&&item.tied?`${rank}*`:rank,teamName,stats.points,stats.gamesPlayed,stats.wins,stats.ties,stats.losses,stats.pointDifferential??stats.goalDifference].forEach(value=>row.append(element('td',value===undefined?'—':String(value))));
        row.append(zoneCell(zone));
      }
      body.append(row);
    }
    table.append(body);$('standings').append(table);
    if(projection){
      const count=projection.appliedCount||0,played=projection.completedCount||0;
      $('comparison-status').textContent=`Simulação de ${participant.name}: ${count} palpite${count===1?'':'s'} aplicado${count===1?'':'s'} nas rodadas 37 e 38.${played?` Em ${played} jogo${played===1?' já realizado, o resultado real foi substituído':'s já realizados, os resultados reais foram substituídos'} pelo palpite nesta cópia.`:''}${projection.pendingCount?` ${projection.pendingCount} jogo${projection.pendingCount===1?' aguarda':'s aguardam'} palpite completo ou dados válidos.`:''}${projection.skippedCount?' Jogos ao vivo ficam fora do cálculo.':''}${!count?' Preencha os placares em “Bora palpitar!” e atualize os resultados.':''}${projection.tied?' * Desempate pendente: confronto direto, cartões ou outros dados não disponíveis; ordem real mantida como referência.':''} Projeção parcial; a tabela real permanece separada.`;
    }
  }
  $('zone-explanation').textContent=season==='2026'?`Vagas para 2027: projeção com ${view==='real'?'a classificação atual':'as posições de cada tabela'} e os desfechos possíveis das finais. Copa do Brasil é uma indicação sobreposta via permanência na Série A; outras vias de entrada também existem.`:'As regras de vagas desta temporada serão conferidas antes de marcar as zonas.';
}
async function refreshStandings({reset=false}={}) {
  const request=++standingsRequest,competition='brasileirao',season=$('standings-season').value;
  if(reset||!latestStandingsTables.length){
    latestStandingsTables=[];
    $('comparison-status').hidden=true;$('comparison-status').textContent='';
    $('standings').replaceChildren();
    $('zone-legend').replaceChildren();$('zone-explanation').textContent='';
  }
  $('standings-source').replaceChildren();
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
    const fetchedAt=new Date().toISOString();latestStandingsTables=tables;requestStandingsRender();
    $('standings-status').textContent=`Classificação ${season} consultada em ${dateLabel(fetchedAt,'Europe/Lisbon')} (Lisboa).`;
    try{localStorage.setItem(cacheKey,JSON.stringify({season,tables,fetchedAt}));}catch{}
  } catch {
    if(request!==standingsRequest)return;
    let cache;try{cache=JSON.parse(localStorage.getItem(cacheKey));}catch{}
    if(cache?.season===season&&Array.isArray(cache.tables)&&cache.tables.length&&Number.isFinite(Date.parse(cache.fetchedAt))) {
      latestStandingsTables=cache.tables;requestStandingsRender();$('standings-status').textContent=`Sem conexão com a fonte agora. Exibindo cópia de ${dateLabel(cache.fetchedAt,'Europe/Lisbon')} (Lisboa). Tente atualizar.`;
    } else $('standings-status').textContent=season==='2027'?'A fonte ainda não forneceu uma classificação válida de 2027. Atualize quando a temporada estiver disponível.':'Não foi possível consultar a classificação agora. Tente atualizar ou abra o link da fonte abaixo.';
  } finally { if(request===standingsRequest)$('refresh-standings').disabled=false; }
}
$('refresh-standings').onclick=()=>autoRefreshController?.refresh();
$('standings-season').onchange=()=>{renderTitlePicks();renderBoardResults();refreshStandings({reset:true});refreshOfficialResults();};
$('board-round').onchange=()=>{renderBoardResults();refreshOfficialResults();};
$('standings-view').onchange=()=>{if(latestStandingsTables.length)renderStandings(latestStandingsTables);else $('comparison-person-label').hidden=$('standings-view').value==='real';};
$('comparison-person').onchange=()=>{if(latestStandingsTables.length)renderStandings(latestStandingsTables);};
renderOriginalLineups();renderMatchPitches();
renderComparisonPeople();renderRounds();renderGames();renderPitch();renderTitlePicks();renderBoardResults();
autoRefreshController=startAutoRefresh({refreshResults:refreshOfficialResults,refreshStandings});
