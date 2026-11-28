const LEAGUE = 'conmebol.libertadores';
const CACHE_TTL = 30_000;
const memory = new Map();
const inFlight = new Map();
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const teamKey = value => {
  const key=normalize(value);
  if(['palmeiras','sepalmeiras','pal'].includes(key))return 'palmeiras';
  if(['estudiantes','estudiantesdelaplata','estudianteslp','est'].includes(key))return 'estudiantes';
  return key;
};
const DEFINITIONS = [
  {key:'ballPossession',label:'Posse de bola',names:['possessionPct','possessionPercentage','ballPossession'],unit:'%'},
  {key:'totalShots',label:'Finalizações',names:['totalShots','shots']},
  {key:'shotsOnTarget',label:'Finalizações no alvo',names:['shotsOnTarget','shotsOnGoal']},
  {key:'cornerKicks',label:'Escanteios',names:['wonCorners','cornerKicks','corners']},
  {key:'foulsCommitted',label:'Faltas cometidas',names:['foulsCommitted','fouls']},
  {key:'yellowCards',label:'Cartões amarelos',names:['yellowCards']},
  {key:'redCards',label:'Cartões vermelhos',names:['redCards']},
  {key:'offsides',label:'Impedimentos',names:['offsides']},
  {key:'saves',label:'Defesas',names:['saves']}
];
const emptyStats = () => DEFINITIONS.map(({key,label,unit})=>({key,label,home:null,away:null,...(unit?{unit}:{})}));
const pairNames = team => [team?.displayName,team?.shortDisplayName,team?.name,team?.abbreviation]
  .filter(name=>typeof name==='string'&&name.trim()).map(teamKey);

function numberValue(value,{integer=false,percent=false}={}) {
  if(value&&typeof value==='object')value=value.value??value.displayValue;
  if(typeof value==='string') {
    value=value.trim();
    if(!value||!/^\d+(?:[.,]\d+)?\s*%?$/.test(value))return null;
    value=value.replace(/\s*%$/,'').replace(',','.');
  }
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=0&&number<=(percent?100:999)
    &&(!integer||Number.isInteger(number))?number:null;
}

function dateInBrazil(value) {
  if(!Number.isFinite(Date.parse(value)))return '';
  const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date(value));
  const part=key=>parts.find(item=>item.type===key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function fixtureConfig(fixture) {
  const eventId=String(fixture?.eventId??'');
  if(typeof fixture?.id!=='string'||!fixture.id||fixture.competition!=='libertadores'
    ||!/^\d+$/.test(eventId)||!/^\d{4}$/.test(String(fixture.season))||typeof fixture.kickoff!=='string'
    ||!Number.isFinite(Date.parse(fixture.kickoff))||String(fixture.season)!==fixture.kickoff.slice(0,4)
    ||typeof fixture.home!=='string'||typeof fixture.away!=='string'
    ||!teamKey(fixture.home)||!teamKey(fixture.away)||teamKey(fixture.home)===teamKey(fixture.away))return null;
  return {eventId,signature:JSON.stringify([fixture.id,eventId,fixture.season,fixture.kickoff,teamKey(fixture.home),teamKey(fixture.away)]),
    key:`catimba:live-match:v1:${LEAGUE}:${eventId}`};
}

function safeSource(header,eventId) {
  for(const link of [...(header?.links||[]),...(header?.linksv4||[])]){
    try{
      const url=new URL(link.href);
      if(url.protocol==='https:'&&/(^|\.)espn\.(com|com\.br)$/i.test(url.hostname)
        &&url.pathname.includes(`/gameId/${eventId}`))return url.href;
    }catch{}
  }
  return `https://www.espn.com.br/futebol/partida/_/jogoId/${eventId}`;
}

function unavailable(fixture,eventId,error) {
  return {fixtureId:fixture?.id||'',state:'unavailable',completed:false,
    home:{name:fixture?.home||'Palmeiras',score:null},away:{name:fixture?.away||'Estudiantes',score:null},
    clock:'',period:null,statusText:'Aguardando a fonte',stats:emptyStats(),events:[],
    sourceUrl:eventId?safeSource(null,eventId):'',fetchedAt:null,stale:false,error};
}

function statusText(status,state) {
  const name=String(status.type?.name||'');
  if(/CANCEL/i.test(name))return 'Jogo cancelado';
  if(/POSTPON/i.test(name))return 'Jogo adiado';
  if(/ABANDON/i.test(name))return 'Jogo abandonado';
  if(/SUSPEND|DELAY/i.test(name))return 'Jogo interrompido';
  if(state==='post')return 'Encerrado';
  if(/HALFTIME|HALF_TIME/i.test(name))return Number(status.period)>2?'Intervalo da prorrogação':'Intervalo';
  if(/PENALT|SHOOTOUT/i.test(name)||Number(status.period)===5)return 'Disputa de pênaltis';
  if(state==='pre')return 'Agendado';
  if(Number(status.period)===1)return '1º tempo';
  if(Number(status.period)===2)return '2º tempo';
  if(Number(status.period)>=3)return 'Prorrogação';
  return state==='in'?'Ao vivo':'Aguardando a fonte';
}

function statistic(team,definition) {
  const matches=(Array.isArray(team?.statistics)?team.statistics:[])
    .filter(stat=>definition.names.includes(stat.name));
  if(matches.length!==1)return null;
  const stat=matches[0];
  return numberValue(stat.value??stat.displayValue,{integer:definition.unit!=='%',percent:definition.unit==='%'});
}

function eventList(events,home,away) {
  if(!Array.isArray(events))return [];
  const labels={goal:'Gol','own-goal':'Gol contra','penalty---scored':'Gol de pênalti',
    'yellow-card':'Cartão amarelo','red-card':'Cartão vermelho','yellow-red-card':'Segundo amarelo',
    substitution:'Substituição',halftime:'Fim do primeiro tempo','end-regular-time':'Fim dos 90 minutos'};
  const seen=new Set(),list=[];
  for(const event of events){
    const type=String(event?.type?.type||''),label=labels[type]||(/^goal---/.test(type)?'Gol':'');
    const id=String(event?.id??'');
    if(!label||!id||seen.has(id)||event.shootout===true)continue;
    const goal=/^(goal(?:---.*)?|own-goal|penalty---scored)$/.test(type);
    if(goal&&(event.scoringPlay!==true||/disallow|cancel|review|no.goal/i.test(`${type} ${event.text||''}`)))continue;
    seen.add(id);
    const teamId=String(event.team?.id??'');
    const team=teamId&&teamId===String(home.id)?home.name:teamId&&teamId===String(away.id)?away.name:null;
    const players=(Array.isArray(event.participants)?event.participants:[]).map(person=>person.athlete?.displayName)
      .filter(name=>typeof name==='string'&&name.trim()).slice(0,2).map(name=>name.slice(0,80));
    const detail=players.join(' · ');
    list.push({id,minute:typeof event.clock?.displayValue==='string'?event.clock.displayValue.slice(0,24):'',
      text:detail?`${label} · ${detail}`:label,...(team?{team}:{})});
  }
  return list.slice(-8).reverse();
}

function normalizeSummary(payload,fixture,config) {
  const header=payload?.header;
  if(String(header?.id)!==config.eventId||Number(header.season?.year)!==Number(fixture.season)
    ||(header.league?.slug&&header.league.slug!==LEAGUE))throw Error('Identidade da partida não confirmada.');
  const competitions=(Array.isArray(header.competitions)?header.competitions:[])
    .filter(game=>String(game.id)===config.eventId);
  if(competitions.length!==1)throw Error('Partida não localizada de forma única.');
  const game=competitions[0];
  if(dateInBrazil(game.date)!==dateInBrazil(fixture.kickoff)||!Array.isArray(game.competitors)||game.competitors.length!==2)
    throw Error('Data ou participantes não confirmados.');
  const findTeam=name=>game.competitors.filter(person=>pairNames(person.team).includes(teamKey(name)));
  const homes=findTeam(fixture.home),aways=findTeam(fixture.away);
  if(homes.length!==1||aways.length!==1||homes[0]===aways[0])throw Error('Equipes não confirmadas.');
  const home=homes[0],away=aways[0],status=game.status||{},type=status.type||{};
  const state=['pre','in','post'].includes(type.state)?type.state:'unavailable';
  const active=state==='in'||state==='post';
  const bodyTeams=Array.isArray(payload.boxscore?.teams)?payload.boxscore.teams:[];
  function boxFor(person){
    const id=String(person.team?.id??person.id??'');
    const matches=bodyTeams.filter(team=>String(team.team?.id??'')===id&&pairNames(team.team)
      .some(name=>pairNames(person.team).includes(name)));
    return matches.length===1?matches[0]:null;
  }
  const homeBox=boxFor(home),awayBox=boxFor(away);
  const side=(person,name)=>({name,score:active?numberValue(person.score,{integer:true}):null,
    ...(active&&numberValue(person.shootoutScore??person.shootOutScore,{integer:true})!==null
      ?{shootoutScore:numberValue(person.shootoutScore??person.shootOutScore,{integer:true})}:{})});
  return {fixtureId:fixture.id,state,completed:state==='post'&&type.completed===true,
    home:side(home,fixture.home),away:side(away,fixture.away),
    clock:active&&typeof status.displayClock==='string'?status.displayClock.slice(0,24):'',
    period:active&&Number.isInteger(status.period)&&status.period>=0&&status.period<=10?status.period:null,
    statusText:statusText(status,state),
    stats:DEFINITIONS.map(definition=>({key:definition.key,label:definition.label,
      home:active?statistic(homeBox,definition):null,away:active?statistic(awayBox,definition):null,
      ...(definition.unit?{unit:definition.unit}:{})})),
    events:active?eventList(payload.keyEvents,{id:home.team?.id??home.id,name:fixture.home},
      {id:away.team?.id??away.id,name:fixture.away}):[],
    sourceUrl:safeSource(header,config.eventId),fetchedAt:new Date().toISOString(),stale:false,error:''};
}

function validCached(data,fixture) {
  return data&&data.fixtureId===fixture.id&&['pre','in','post','unavailable'].includes(data.state)
    &&typeof data.completed==='boolean'&&data.home?.name===fixture.home&&data.away?.name===fixture.away
    &&[data.home.score,data.away.score].every(value=>value===null||numberValue(value,{integer:true})===value)
    &&Array.isArray(data.stats)&&data.stats.length===DEFINITIONS.length
    &&data.stats.every((stat,index)=>stat.key===DEFINITIONS[index].key&&stat.label===DEFINITIONS[index].label
      &&stat.unit===DEFINITIONS[index].unit
      &&[stat.home,stat.away].every(value=>value===null||numberValue(value,{percent:stat.unit==='%',integer:stat.unit!=='%'})===value))
    &&Number.isFinite(Date.parse(data.fetchedAt))&&typeof data.sourceUrl==='string'
    &&typeof data.clock==='string'&&typeof data.statusText==='string'&&Array.isArray(data.events)&&data.events.length<=8
    &&data.events.every(event=>typeof event?.id==='string'&&typeof event.minute==='string'&&typeof event.text==='string'
      &&(event.team===undefined||typeof event.team==='string'));
}

/** Read-only, identity-checked live data. It never writes picks or scoring state. */
export async function fetchLiveMatch(fixture,{force=false}={}) {
  const config=fixtureConfig(fixture);
  if(!config)return unavailable(fixture,null,'Calendário ainda não configurado para as estatísticas.');
  let cached=memory.get(config.key);
  if(!cached){try{cached=JSON.parse(globalThis.localStorage?.getItem(config.key)||'null');}catch{}}
  if(!cached||cached.version!==1||cached.signature!==config.signature||!validCached(cached.data,fixture)
    ||Date.parse(cached.data.fetchedAt)>Date.now()+300_000)cached=null;
  if(cached)memory.set(config.key,cached);
  const age=cached?Date.now()-Date.parse(cached.data.fetchedAt):Infinity;
  if(!force&&age>=0&&age<CACHE_TTL)return {...cached.data,stale:false,error:''};
  const flightKey=`${config.key}:${config.signature}`;
  if(inFlight.has(flightKey))return inFlight.get(flightKey);
  const task=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12_000);
    try{
      const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/summary?event=${config.eventId}`,
        {signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw Error('A fonte não respondeu.');
      const data=normalizeSummary(await response.json(),fixture,config);
      const value={version:1,signature:config.signature,data};memory.set(config.key,value);
      try{globalThis.localStorage?.setItem(config.key,JSON.stringify(value));}catch{}
      return data;
    }catch{
      if(cached)return {...cached.data,stale:true,error:'Não foi possível atualizar agora. Exibindo a última consulta guardada.'};
      return unavailable(fixture,config.eventId,'Estatísticas indisponíveis agora. Nova tentativa automática em instantes.');
    }finally{clearTimeout(timer);}
  })();
  inFlight.set(flightKey,task);
  try{return await task;}finally{if(inFlight.get(flightKey)===task)inFlight.delete(flightKey);}
}
