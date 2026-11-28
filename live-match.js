let liveMatchSequence=0;

const METRICS=[
  ['ballPossession','Posse de bola','%'],
  ['totalShots','Finalizações'],
  ['shotsOnTarget','Finalizações no alvo'],
  ['cornerKicks','Escanteios'],
  ['foulsCommitted','Faltas cometidas'],
  ['yellowCards','Cartões amarelos'],
  ['redCards','Cartões vermelhos'],
  ['offsides','Impedimentos'],
  ['saves','Defesas']
];
const text=value=>typeof value==='string'?value.slice(0,500):'';
const score=value=>Number.isInteger(value)&&value>=0&&value<=999?String(value):'—';
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;

function create(document,tag,className,value) {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(value!==undefined)node.textContent=value;
  return node;
}

function replaceText(node,value) {
  const next=String(value??'');
  if(node.textContent!==next)node.textContent=next;
}

function safeSource(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&/(^|\.)espn\.(com|com\.br)$/i.test(url.hostname)?url.href:null;
  } catch { return null; }
}

function date(value,timeZone) {
  if(!Number.isFinite(Date.parse(value)))return '';
  return new Intl.DateTimeFormat('pt-BR',{timeZone,dateStyle:'short',timeStyle:'short'}).format(new Date(value));
}

function matchStatus(data) {
  const detail=text(data?.statusText);
  if(/postpon|adiad/i.test(detail))return 'Adiado';
  if(/cancel/i.test(detail))return 'Cancelado';
  if(/suspend|interromp|delay/i.test(detail))return 'Interrompido';
  if(data?.state==='post')return 'Encerrado';
  if(data?.state==='in') {
    if(/halftime|half.time|intervalo/i.test(detail))return 'Intervalo';
    if(/penalt|pênalti|shootout/i.test(detail))return 'Disputa de pênaltis';
    if(/extra|prorroga/i.test(detail))return 'Prorrogação';
    return 'Ao vivo';
  }
  return data?.state==='pre'?'Agendado':'Sem atualização';
}

/**
 * Read-only live match card. Updates only its own nodes and keeps the refresh
 * control mounted and focusable, including while a request is in progress.
 */
export function mountLiveMatch(container,{fixture={},onRefresh}={}) {
  const document=container.ownerDocument;
  const make=(tag,className,value)=>create(document,tag,className,value);
  const instance=++liveMatchSequence;
  const root=make('div','live-match');
  root.setAttribute('role','region');
  const heading=make('h3','live-match__heading','Libertadores · final');
  heading.id=`live-match-title-${instance}`;
  root.setAttribute('aria-labelledby',heading.id);

  const toolbar=make('div','live-match__toolbar');
  const title=make('div','live-match__title');
  title.append(make('p','live-match__kicker','CENTRAL DO JOGO'),heading);
  const refresh=make('button','live-match__refresh','Atualizar agora');
  refresh.type='button';
  toolbar.append(title,refresh);

  const statusLine=make('div','live-match__status-line');
  const badge=make('span','live-match__badge','Consultando');
  const clock=make('span','live-match__clock');
  statusLine.append(badge,clock);

  const scoreboard=make('div','live-match__scoreboard');
  const home=make('div','live-match__team live-match__team--home');
  const homeName=make('strong','live-match__team-name',text(fixture.home)||'Palmeiras');
  const homeScore=make('span','live-match__score','—');
  const away=make('div','live-match__team live-match__team--away');
  const awayName=make('strong','live-match__team-name',text(fixture.away)||'Estudiantes');
  const awayScore=make('span','live-match__score','—');
  home.append(homeName,homeScore);away.append(awayName,awayScore);
  scoreboard.append(home,make('span','live-match__versus','×'),away);
  const shootout=make('p','live-match__shootout');shootout.hidden=true;
  const schedule=make('p','live-match__schedule');
  const brazil=date(fixture.kickoff,'America/Sao_Paulo'),lisbon=date(fixture.kickoff,'Europe/Lisbon');
  schedule.textContent=[brazil?`${brazil} (Brasília)`:'',lisbon?`${lisbon} (Lisboa)`:'',text(fixture.stadium)].filter(Boolean).join(' · ');

  const table=make('table','live-match__stats');
  table.append(make('caption','live-match__caption','Estatísticas da partida'));
  const tableHead=make('thead'),headRow=make('tr');
  const homeColumn=make('th','live-match__column live-match__column--home',homeName.textContent);
  const metricColumn=make('th','live-match__column','Estatística');
  const awayColumn=make('th','live-match__column live-match__column--away',awayName.textContent);
  for(const cell of [homeColumn,metricColumn,awayColumn])cell.scope='col';
  headRow.append(homeColumn,metricColumn,awayColumn);tableHead.append(headRow);table.append(tableHead);
  const body=make('tbody'),metricNodes=new Map();
  for(const [key,label,unit] of METRICS){
    const row=make('tr','live-match__stat-row');row.dataset.stat=key;
    const homeValue=make('td','live-match__stat-value live-match__stat-value--home','—');
    const caption=make('th','live-match__metric',label);caption.scope='row';
    const awayValue=make('td','live-match__stat-value live-match__stat-value--away','—');
    row.append(homeValue,caption,awayValue);body.append(row);
    metricNodes.set(key,{homeValue,awayValue,caption,unit});
  }
  table.append(body);
  const note=make('p','live-match__note','Buscando os dados da partida…');
  const eventsWrap=make('div','live-match__events');eventsWrap.hidden=true;
  eventsWrap.append(make('h4','live-match__events-title','Últimos lances'));
  const eventList=make('ul','live-match__event-list');eventsWrap.append(eventList);

  const footer=make('div','live-match__footer');
  const source=make('a','live-match__source','Conferir na ESPN');
  source.href='https://www.espn.com.br/futebol/placar/_/liga/conmebol.libertadores';
  source.target='_blank';source.rel='noopener noreferrer';
  const updated=make('span','live-match__updated','Aguardando a primeira consulta.');
  footer.append(source,updated);
  const warning=make('p','live-match__warning');warning.hidden=true;
  warning.setAttribute('role','status');
  root.append(toolbar,statusLine,scoreboard,shootout,schedule,table,note,eventsWrap,footer,warning);
  container.replaceChildren(root);

  let loading=false,lastEvents='';
  const formatter=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  function setLoading(value){
    loading=value===true;
    root.setAttribute('aria-busy',String(loading));
    refresh.setAttribute('aria-disabled',String(loading));
    replaceText(refresh,loading?'Atualizando…':'Atualizar agora');
  }
  refresh.addEventListener('click',()=>{
    if(loading||typeof onRefresh!=='function')return;
    const failed=()=>{warning.hidden=false;replaceText(warning,'Não foi possível atualizar agora. Uma nova consulta será feita automaticamente.');setLoading(false);};
    try {Promise.resolve(onRefresh()).catch(failed);}catch{failed();}
  });

  function update(data={}) {
    if(data.fixtureId&&fixture.id&&data.fixtureId!==fixture.id)return false;
    const active=data.state==='in'||data.state==='post';
    const state=['pre','in','post'].includes(data.state)?data.state:'unavailable';
    root.dataset.state=state;
    badge.classList.toggle('live-match__badge--live',state==='in');
    badge.classList.toggle('live-match__badge--ended',state==='post');
    replaceText(badge,matchStatus(data));
    replaceText(clock,active&&text(data.clock)?`Tempo na fonte: ${text(data.clock)}`:'');
    clock.hidden=!clock.textContent;
    replaceText(homeName,text(fixture.home)||text(data.home?.name)||'Mandante');
    replaceText(awayName,text(fixture.away)||text(data.away?.name)||'Visitante');
    replaceText(homeColumn,homeName.textContent);replaceText(awayColumn,awayName.textContent);
    replaceText(homeScore,active?score(data.home?.score):'—');
    replaceText(awayScore,active?score(data.away?.score):'—');
    scoreboard.setAttribute('aria-label',`${homeName.textContent} ${homeScore.textContent} a ${awayScore.textContent} ${awayName.textContent}`);
    const hasShootout=active&&score(data.home?.shootoutScore)!=='—'&&score(data.away?.shootoutScore)!=='—';
    shootout.hidden=!hasShootout;
    replaceText(shootout,hasShootout?`Pênaltis: ${homeName.textContent} ${data.home.shootoutScore} × ${data.away.shootoutScore} ${awayName.textContent}`:'');

    const stats=new Map((Array.isArray(data.stats)?data.stats:[]).filter(item=>item&&typeof item.key==='string').map(item=>[item.key,item]));
    let available=0;
    for(const [key,nodes] of metricNodes){
      const item=stats.get(key);
      const unit=item?.unit==='%'||nodes.unit==='%'?'%':'';
      for(const [side,node] of [['home',nodes.homeValue],['away',nodes.awayValue]]){
        const value=active?number(item?.[side]):null;
        const valid=value!==null&&(!unit||value<=100);
        replaceText(node,valid?`${formatter.format(value)}${unit}`:'—');
        if(valid)available++;
      }
    }
    replaceText(note,state==='pre'?'Os números aparecerão quando a partida começar e a fonte disponibilizar os dados.':available===0?'A fonte ainda não informou as estatísticas desta partida.':'Números da fonte, sujeitos a atualização. Um travessão indica dado ainda não informado.');

    const events=active?(Array.isArray(data.events)?data.events:[]).filter(item=>item&&text(item.text)).slice(-8):[];
    const eventsKey=JSON.stringify(events.map(item=>[text(item.minute),text(item.text)]));
    if(eventsKey!==lastEvents){
      lastEvents=eventsKey;
      eventList.replaceChildren(...events.map(item=>{
        const row=make('li','live-match__event');
        row.append(make('strong','live-match__event-minute',text(item.minute)||'—'),make('span','live-match__event-text',text(item.text)));
        return row;
      }));
    }
    eventsWrap.hidden=!events.length;
    const url=safeSource(data.sourceUrl);if(url)source.href=url;
    const fetched=date(data.fetchedAt,'Europe/Lisbon');
    replaceText(updated,fetched?`${data.stale?'Cópia consultada':'Última consulta'}: ${fetched} (Lisboa)`:'Aguardando a primeira consulta.');
    const messages=[];
    if(data.stale)messages.push('Sem atualização da fonte agora. Exibindo a última cópia disponível.');
    else if(data.error||state==='unavailable')messages.push('Não foi possível obter todos os dados agora. Uma nova consulta será feita automaticamente.');
    messages.push('Os dados podem chegar com atraso em relação à partida.');
    replaceText(warning,messages.join(' '));warning.hidden=false;
    return true;
  }
  return {update,setLoading};
}
