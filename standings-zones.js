const teamKey = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

// REC Série A 2026 arts. 6–8; REC Copa do Brasil 2026 art. 4.
// Qualification rules apply to whichever table is displayed: real or clearly labelled simulation.
export function projectZones(rows,{season='2026',libertadoresWinner=null,copaWinner=null}={}) {
  const zones={};
  if(String(season)!=='2026'||rows.length!==20||rows.some(row=>!Number.isInteger(row.rank)||row.rank<1||row.rank>20)||new Set(rows.map(row=>row.rank)).size!==20)return zones;
  const ordered=[...rows].sort((a,b)=>a.rank-b.rank);
  const eligible=new Set(ordered.filter(row=>row.rank<=16).map(row=>teamKey(row.teamName)));
  const firstAvailable=excluded=>ordered.find(row=>eligible.has(teamKey(row.teamName))&&!excluded.has(teamKey(row.teamName)));
  const libOptions=libertadoresWinner?[libertadoresWinner]:['Palmeiras','Estudiantes'];
  const copaOptions=copaWinner?[copaWinner]:['Grêmio','Palmeiras'];
  const scenarios=[];
  for(const lib of libOptions)for(const copa of copaOptions) {
    const groups=new Set(ordered.slice(0,4).map(row=>teamKey(row.teamName)));
    const prelim=new Set();
    const addLeagueGroup=()=>{const row=firstAvailable(groups);if(row)groups.add(teamKey(row.teamName));};
    const libKey=teamKey(lib);
    if(libKey==='palmeiras'&&eligible.has(libKey)) {
      if(groups.has(libKey))addLeagueGroup();else groups.add(libKey);
    }
    const winner=teamKey(copa),runner=winner==='gremio'?'palmeiras':'gremio';
    if(eligible.has(winner)&&!groups.has(winner))groups.add(winner);
    else if(eligible.has(runner)&&!groups.has(runner))groups.add(runner);
    else addLeagueGroup();
    const addLeaguePrelim=()=>{const row=firstAvailable(new Set([...groups,...prelim]));if(row)prelim.add(teamKey(row.teamName));};
    addLeaguePrelim();
    if(eligible.has(runner)&&!groups.has(runner)&&!prelim.has(runner))prelim.add(runner);
    else addLeaguePrelim();
    const continental=new Set([...groups,...prelim]);
    const sula=new Set(ordered.filter(row=>eligible.has(teamKey(row.teamName))&&!continental.has(teamKey(row.teamName))).slice(0,6).map(row=>teamKey(row.teamName)));
    scenarios.push({groups,prelim,sula});
  }
  for(const row of ordered) {
    const key=teamKey(row.teamName),options=new Set(scenarios.map(scenario=>scenario.groups.has(key)?'groups':scenario.prelim.has(key)?'prelim':scenario.sula.has(key)?'sula':'none'));
    let type='neutral',label='Sem vaga continental nesta projeção';
    if(row.rank>=17){type='relegation';label='Zona de rebaixamento';}
    else if(options.size===1&&options.has('groups')){type='libertadores';label='Libertadores · grupos';}
    else if([...options].every(option=>option==='groups'||option==='prelim')){type='libertadores';label=options.size===1?'Pré-Libertadores':'Libertadores · fase a definir';}
    else if(options.has('groups')||options.has('prelim')){type='continental-pending';label='Libertadores / Sul-Americana · depende das finais';}
    else if(options.size===1&&options.has('sula')){type='sulamericana';label='Sul-Americana';}
    else if(options.has('sula')){type='sula-pending';label='Possível Sul-Americana · depende das finais';}
    zones[row.teamName]={type,label,copa2027:row.rank<=16,projection:true};
  }
  return zones;
}
