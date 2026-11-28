function create(tag,text,className) {
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
}

const validGoal=value=>value===null||(Number.isInteger(value)&&value>=0&&value<=99);
const validPair=value=>Array.isArray(value)&&value.length===2&&value.every(validGoal);
const pairText=value=>validPair(value)?value.map(goal=>goal===null?'—':String(goal)).join(' × '):'Não informado';

function confirmedScore(result) {
  if(result?.completed!==true||result.regulationConfirmed!==true)return null;
  const score=result.regulationScore??[result.homeScore,result.awayScore];
  return validPair(score)&&score.every(Number.isInteger)?score:null;
}

function sourceText(record) {
  const sources=Array.isArray(record?.sourceLabels)?record.sourceLabels.filter(value=>typeof value==='string'):[];
  return [...new Set(sources.length?sources:record?.sourceLabel?[record.sourceLabel]:[])].join(' · ');
}

function recordCell(record,className) {
  const cell=create('td',undefined,className);
  cell.append(create('strong',pairText(record?.values),'saved-history__score'));
  if(record&&!record.isCurrent)cell.append(create('small','Registro anterior','saved-history__origin'));
  const source=sourceText(record);
  if(source)cell.title=source;
  return cell;
}

/** Read-only record of every saved league pick, independent of form filters. */
export function mountSavedHistory(container,{
  rows=[],participants=[],officialResults={},onOpen
}={}) {
  const records=Array.isArray(rows)?rows:[];
  const people=new Map();
  for(const person of Array.isArray(participants)?participants:[]){
    if(person&&typeof person.id==='string'&&typeof person.name==='string')people.set(person.id,person.name);
  }
  if(!people.has('carlinhos'))people.set('carlinhos','Carlinhos');
  if(!people.has('tiba'))people.set('tiba','Tiba');
  for(const row of records)for(const record of row.predictions||[]){
    if(typeof record.participantId==='string'&&!people.has(record.participantId))
      people.set(record.participantId,record.participantName||'Participante anterior');
  }
  const ordered=[...people.entries()].sort(([a],[b])=>{
    const rank=id=>id==='carlinhos'?0:id==='tiba'?1:2;
    return rank(a)-rank(b);
  });
  const wrapper=create('div',undefined,'saved-history__body');
  wrapper.append(create('p','Todas as rodadas com registros encontrados neste navegador. Os palpites do Carlinhos, do Tiba e dos convidados permanecem ao lado dos resultados digitados e dos resultados automáticos.','saved-history__intro'));
  if(!records.length){
    wrapper.append(create('p','Nenhum palpite salvo foi encontrado neste navegador. Se você preencheu em outro navegador ou aparelho, abra o Catimba nele ou restaure seu histórico.','saved-history__empty'));
    container.replaceChildren(wrapper);
    return {rows:0,participants:ordered.length,variants:0};
  }
  const table=create('table',undefined,'saved-history__table');
  table.append(create('caption',`${records.length} jogo${records.length===1?'':'s'} com registros guardados · Brasileirão`));
  const head=create('thead'),header=create('tr');
  for(const label of ['Temporada / rodada','Jogo',...ordered.map(([,name])=>`Palpite · ${name}`),'Resultado digitado anteriormente','Resultado automático']){
    const th=create('th',label);th.scope='col';header.append(th);
  }
  head.append(header);table.append(head);
  const body=create('tbody');
  let variantCount=0;
  for(const saved of records){
    const predictions=Array.isArray(saved.predictions)?saved.predictions:[];
    const results=Array.isArray(saved.results)?saved.results:[];
    const row=create('tr');row.dataset.historyId=saved.id;
    const round=saved.round==='archive'?'Arquivo anterior':saved.round?`${saved.round}ª rodada`:'Rodada a identificar';
    row.append(create('td',`${saved.season||'Temporada anterior'} · ${round}`,'saved-history__period'));
    const game=create('td',undefined,'saved-history__game');
    const label=saved.label||(saved.home&&saved.away?`${saved.home} × ${saved.away}`:'Confronto anterior a identificar');
    game.append(create('strong',label));
    if(!saved.fixture){
      const reference=typeof saved.id==='string'?saved.id.replace(/^legacy:/,''):'';
      if(reference)game.append(create('small',`Referência: ${reference}`,'saved-history__reference'));
    }else if(typeof onOpen==='function'){
      const button=create('button','Ver jogo','saved-history__open');button.type='button';
      button.setAttribute('aria-label',`Ver jogo: ${label}`);
      button.addEventListener('click',()=>onOpen(saved.id));game.append(button);
    }
    row.append(game);
    const extras=[];
    for(const [id,name] of ordered){
      const matches=predictions.filter(record=>record.participantId===id&&validPair(record.values));
      row.append(recordCell(matches[0],'saved-history__pick'));
      for(const record of matches.slice(1))extras.push({record,label:`Palpite de ${record.participantName||name}`});
    }
    row.append(recordCell(results[0],'saved-history__manual'));
    for(const record of results.slice(1))extras.push({record,label:'Resultado digitado'});
    const actual=officialResults[saved.id],actualCell=create('td',undefined,'saved-history__automatic');
    const score=confirmedScore(actual);
    if(score){
      actualCell.append(create('strong',pairText(score),'saved-history__score'),create('small','90 minutos confirmados','saved-history__origin'));
      if(actual.stale||actual.regulationStale)actualCell.append(create('small','Última cópia guardada','saved-history__origin'));
    }else actualCell.append(create('span',actual?.officialText||(!saved.fixture||saved.fixture.archived?'Confronto fora da tabela conferida':'Aguardando a fonte')));
    row.append(actualCell);body.append(row);
    if(extras.length){
      variantCount+=extras.length;
      const versionsRow=create('tr',undefined,'saved-history__versions-row'),cell=create('td');cell.colSpan=ordered.length+4;
      const details=create('details',undefined,'saved-history__versions');
      details.open=true;
      details.append(create('summary',`${extras.length} outro${extras.length===1?' registro preservado':'s registros preservados'} deste jogo`));
      const list=create('ul');
      for(const {record,label} of extras){
        const item=create('li',`${label}: ${pairText(record.values)}`);
        const source=sourceText(record);if(source)item.append(create('small',source,'saved-history__origin'));
        list.append(item);
      }
      details.append(list);cell.append(details);versionsRow.append(cell);body.append(versionsRow);
    }
  }
  table.append(body);
  const scroll=create('div',undefined,'saved-history__scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Histórico completo dos palpites do Brasileirão');scroll.append(table);
  wrapper.append(scroll,create('p','Os resultados digitados anteriormente ficam preservados. A conferência automática e a pontuação usam o placar real confirmado dos 90 minutos. “—” indica um campo que ficou em branco.','saved-history__note'));
  container.replaceChildren(wrapper);
  return {rows:records.length,participants:ordered.length,variants:variantCount};
}
