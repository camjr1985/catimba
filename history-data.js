const MAX_SOURCE_SIZE = 5_000_000;
const SOURCE_KEY = /^(?:catimba|catimba:(?:before-import|recovery|before-recovery):.+)$/;
const OLD_KEY = /^\d+-\d+$/;
const PARTICIPANT_ID = /^[a-zA-Z0-9:-]{1,100}$/;
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validScore = value => value === null || (Number.isInteger(value) && value >= 0 && value <= 99);
const validPair = value => Array.isArray(value) && value.length === 2 && value.every(validScore);
const hasScore = value => validPair(value) && value.some(score => score !== null);
const normalizeName = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
const validPerson = person => record(person) && typeof person.id === 'string' && PARTICIPANT_ID.test(person.id)
  && !['constructor','prototype','__proto__'].includes(person.id)
  && typeof person.name === 'string' && person.name.trim() && person.name.length <= 40;
const clone = value => JSON.parse(JSON.stringify(value));
const hosts = () => [{id:'carlinhos',name:'Carlinhos'},{id:'tiba',name:'Tiba'}];

export function legacyFixtureId(key) {
  return key === '37-1' ? 'brasileirao:2026:cbf:363' : `legacy:${key}`;
}

function historyFixtureId(id) {
  if(typeof id !== 'string')return null;
  if(OLD_KEY.test(id))return legacyFixtureId(id);
  return /^brasileirao:\d{4}:.+/.test(id)||/^legacy:\d+-\d+$/.test(id)?id:null;
}

function legacyState(raw) {
  const state={version:2,participants:hosts(),predictions:{},results:{},champions:{},tournamentChampions:{},lineups:{},teamLineups:{},legacy:clone(raw),updatedAt:null};
  for(const [key,values] of Object.entries(raw)){
    if(!OLD_KEY.test(key)||!Array.isArray(values)||values.length!==6)continue;
    const id=legacyFixtureId(key),picks={};
    hosts().forEach((person,index)=>{const pair=values.slice(index*2,index*2+2);if(validPair(pair))picks[person.id]=pair;});
    if(Object.keys(picks).length)state.predictions[id]=picks;
    const result=values.slice(4,6);if(validPair(result))state.results[id]=result;
  }
  return state;
}

function readableState(value) {
  return record(value)&&value.version===2&&Array.isArray(value.participants)
    && record(value.predictions)&&record(value.results);
}

function sourceLabel(key) {
  if(key==='catimba')return 'Histórico da primeira versão';
  const label=key.startsWith('catimba:before-import:')?'Cópia anterior à importação':key.startsWith('catimba:before-recovery:')?'Cópia anterior à recuperação':'Cópia de recuperação';
  const stamp=key.slice(key.lastIndexOf(':')+1);
  const date=new Date(Number(stamp));
  const when=/^\d+$/.test(stamp)&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('pt-BR',{timeZone:'Europe/Lisbon',dateStyle:'short',timeStyle:'short'}).format(date):'data anterior';
  return `${label} · ${when}`;
}

/** Read saved copies only; never writes, deletes or changes browser storage. */
export function readSavedSources(storage) {
  const sources=[],warnings=[];
  let keys;
  try {keys=Array.from({length:storage.length},(_,index)=>storage.key(index)).filter(key=>typeof key==='string'&&SOURCE_KEY.test(key));}
  catch {return {sources,warnings:['Não foi possível consultar as cópias deste navegador.']};}
  keys=[...new Set(keys)].sort((a,b)=>a==='catimba'?-1:b==='catimba'?1:b.localeCompare(a,undefined,{numeric:true}));
  for(const key of keys){
    try{
      const raw=storage.getItem(key);
      if(typeof raw!=='string')continue;
      if(raw.length>MAX_SOURCE_SIZE||new TextEncoder().encode(raw).length>MAX_SOURCE_SIZE){warnings.push(`${sourceLabel(key)} excede o limite de leitura de 5 MB.`);continue;}
      const parsed=JSON.parse(raw);
      if(readableState(parsed)){sources.push({key,label:sourceLabel(key),state:parsed});continue;}
      if(record(parsed)&&parsed.version===undefined&&Object.keys(parsed).some(name=>OLD_KEY.test(name))){
        sources.push({key,label:sourceLabel(key),state:legacyState(parsed),rawLegacy:parsed});continue;
      }
      warnings.push(`${sourceLabel(key)} não contém um histórico legível.`);
    }catch{warnings.push(`${sourceLabel(key)} não pôde ser lida. A cópia original foi mantida.`);}
  }
  return {sources,warnings};
}

function sourceStates(current,sources) {
  const list=[];
  if(record(current?.legacy)&&Object.keys(current.legacy).length)list.push({key:'current:legacy',label:'Histórico anterior preservado',state:legacyState(current.legacy),isCurrent:false});
  for(const source of Array.isArray(sources)?sources:[]){
    if(!source||!readableState(source.state))continue;
    list.push({...source,isCurrent:false});
    if(record(source.state.legacy)&&Object.keys(source.state.legacy).length)list.push({...source,state:legacyState(source.state.legacy),isCurrent:false});
  }
  return list;
}

/** Fill only missing score properties. Existing blanks and zeroes are intentional. */
export function recoverMissing(current,sources=[]) {
  const state=clone(current),before=JSON.stringify(state);
  let recoveredCount=0;
  if(!Array.isArray(state.participants)||!record(state.predictions)||!record(state.results))return {state,changed:false,recoveredCount};
  if(!own(state,'legacy'))state.legacy={};
  const people=new Map(state.participants.filter(validPerson).map(person=>[person.id,person]));
  const names=new Map(state.participants.filter(validPerson).map(person=>[normalizeName(person.name),person.id]));
  for(const source of sourceStates(current,sources)){
    const ids=new Map();
    const sourcePeople=source.state.participants.filter(validPerson);
    const sourceIds=new Map(),sourceNames=new Map();
    for(const person of sourcePeople){
      sourceIds.set(person.id,(sourceIds.get(person.id)||0)+1);
      const name=normalizeName(person.name);sourceNames.set(name,(sourceNames.get(name)||0)+1);
    }
    for(const person of sourcePeople){
      const existing=people.get(person.id),name=normalizeName(person.name);
      if(sourceIds.get(person.id)!==1||sourceNames.get(name)!==1)continue;
      if(existing){if(normalizeName(existing.name)===name)ids.set(person.id,person.id);continue;}
      if(names.has(name)){ids.set(person.id,names.get(name));continue;}
      if(state.participants.length>=100)continue;
      const added={id:person.id,name:person.name};state.participants.push(added);people.set(person.id,added);names.set(name,person.id);ids.set(person.id,person.id);
    }
    for(const person of hosts())if(people.has(person.id)&&!ids.has(person.id)
      && !source.state.participants.some(candidate=>candidate?.id===person.id))ids.set(person.id,person.id);
    for(const [oldId,picks] of Object.entries(source.state.predictions)){
      const id=historyFixtureId(oldId);if(!id||!record(picks))continue;
      if(own(state.predictions,id)&&!record(state.predictions[id]))continue;
      for(const [oldPerson,pair] of Object.entries(picks)){
        const person=ids.get(oldPerson);if(!person||!hasScore(pair))continue;
        if(!own(state.predictions,id))state.predictions[id]={};
        if(own(state.predictions[id],person))continue;
        state.predictions[id][person]=[...pair];recoveredCount++;
      }
    }
    for(const [oldId,pair] of Object.entries(source.state.results)){
      const id=historyFixtureId(oldId);if(!id||!hasScore(pair)||own(state.results,id))continue;
      state.results[id]=[...pair];recoveredCount++;
    }
    for(const [key,value] of Object.entries(record(state.legacy)&&record(source.state.legacy)?source.state.legacy:{})){
      if(!OLD_KEY.test(key)||own(state.legacy,key)||!Array.isArray(value)||value.length!==6
        || ![0,2,4].some(index=>hasScore(value.slice(index,index+2))))continue;
      state.legacy[key]=clone(value);
    }
  }
  return {state,changed:JSON.stringify(state)!==before,recoveredCount};
}

/** All saved Brasileirão rows, independent of the currently selected round. */
export function buildHistoryRows(fixtures,current,sources=[]) {
  const fixtureMap=new Map((Array.isArray(fixtures)?fixtures:[]).filter(game=>game&&historyFixtureId(game.id)
    && (game.competition==='brasileirao'||game.archived)).map(game=>[historyFixtureId(game.id),game]));
  const currentNames=new Map((current?.participants||[]).filter(validPerson).map(person=>[person.id,person.name]));
  const rows=new Map();
  function rowFor(id){
    if(rows.has(id))return rows.get(id);
    const fixture=fixtureMap.get(id)||null,raw=id.startsWith('legacy:')?id.slice(7):id;
    const oldRound=/^(\d+)-\d+$/.exec(raw)?.[1];
    const row={id,fixture,label:fixture?`${fixture.home} × ${fixture.away}`:`Confronto salvo a identificar · ${raw}`,
      home:fixture?.home||'',away:fixture?.away||'',season:fixture?.season||(/^brasileirao:(\d{4}):/.exec(id)?.[1]??''),
      round:fixture?.round||oldRound||'',unmapped:!fixture,predictions:[],results:[]};
    rows.set(id,row);return row;
  }
  function add(entries,entry){
    const existing=entries.find(item=>item.participantId===entry.participantId&&JSON.stringify(item.values)===JSON.stringify(entry.values));
    if(existing){
      if(!existing.sourceLabels.includes(entry.sourceLabel))existing.sourceLabels.push(entry.sourceLabel);
      existing.isCurrent ||= entry.isCurrent;
      return;
    }
    entries.push({...entry,values:[...entry.values],sourceLabels:[entry.sourceLabel]});
  }
  const list=[{key:'current',label:'Salvo neste navegador',state:current,isCurrent:true},...sourceStates(current,sources)];
  for(const source of list){
    if(!readableState(source.state))continue;
    const people=new Map(source.state.participants.filter(validPerson).map(person=>[person.id,person.name]));
    const base={sourceLabel:source.label,sourceKey:source.key,isCurrent:source.isCurrent===true};
    for(const [oldId,picks] of Object.entries(source.state.predictions)){
      const id=historyFixtureId(oldId);if(!id||!record(picks))continue;
      for(const [participantId,values] of Object.entries(picks)){
        if(!PARTICIPANT_ID.test(participantId)||!validPair(values))continue;
        add(rowFor(id).predictions,{...base,participantId,participantName:currentNames.get(participantId)||people.get(participantId)||`Participante salvo · ${participantId}`,values});
      }
    }
    for(const [oldId,values] of Object.entries(source.state.results)){
      const id=historyFixtureId(oldId);if(!id||!validPair(values))continue;
      add(rowFor(id).results,{...base,values});
    }
  }
  return [...rows.values()].filter(row=>row.predictions.some(item=>hasScore(item.values))||row.results.some(item=>hasScore(item.values)))
    .sort((a,b)=>(Number(a.season)||0)-(Number(b.season)||0)||(Number(a.round)||0)-(Number(b.round)||0)||a.id.localeCompare(b.id,undefined,{numeric:true}));
}
