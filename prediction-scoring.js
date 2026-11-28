const completeScore = score => Array.isArray(score) && score.length === 2
  && score.every(value => Number.isInteger(value) && value >= 0 && value <= 99);

// Only a finished match with a confirmed 90-minute score can award points.
export function automaticScore(result) {
  if(result?.completed!==true||result.regulationConfirmed!==true)return null;
  const score=result.regulationScore??[result.homeScore,result.awayScore];
  return completeScore(score)?[...score]:null;
}

export function scorePredictions(participants,fixtures,predictions,results) {
  const totals=participants.map(person=>({id:person.id,name:person.name,points:0}));
  const seen=new Set();
  let countedMatches=0,pendingMatches=0,cachedMatches=0;
  for(const game of fixtures){
    if(!game?.id||game.archived||seen.has(game.id))continue;
    seen.add(game.id);
    const actual=results[game.id],score=automaticScore(actual);
    if(!score){if(actual?.completed===true)pendingMatches++;continue;}
    countedMatches++;
    if(actual.stale||actual.regulationStale)cachedMatches++;
    for(const person of totals){
      const pick=predictions[game.id]?.[person.id];
      if(!completeScore(pick))continue;
      if(pick[0]===score[0]&&pick[1]===score[1])person.points+=3;
      else if(Math.sign(pick[0]-pick[1])===Math.sign(score[0]-score[1]))person.points++;
    }
  }
  totals.sort((a,b)=>b.points-a.points);
  return {totals,countedMatches,pendingMatches,cachedMatches};
}
