// A participant's scenario is a copy of the real table, never a replacement for it.
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = [
  ['atleticomg', 'atleticomineiro', 'clubatleticomineiro', 'cam'],
  ['athleticopr', 'athleticoparanaense', 'atleticoparanaense', 'cap'],
  ['vascodagama', 'vasco', 'crvascodagama', 'vas'],
  ['redbullbragantino', 'rbbragantino', 'bragantino', 'rbb'],
  ['gremio', 'gremioportoalegre', 'gre'],
  ['palmeiras', 'sepalmeiras', 'pal'],
  ['saopaulo', 'saopaulofc', 'sao'],
  ['flamengo', 'crflamengo', 'fla'],
  ['chapecoense', 'achapecoense', 'cha'],
  ['corinthians', 'sccorinthianspaulista', 'cor'],
  ['internacional', 'scinternacional', 'int'],
  ['botafogo', 'botafogofr', 'bot'],
  ['fluminense', 'fluminensefc', 'flu'],
  ['cruzeiro', 'cruzeiroec', 'cru'],
  ['coritiba', 'coritibafc', 'cfc'],
  ['mirassol', 'mirassolfc', 'mir'],
  ['bahia', 'ecbahia', 'bah'],
  ['vitoria', 'ecvitoria', 'vit'],
  ['santos', 'santosfc', 'san'],
  ['remo', 'clubedoremo']
];
const names = new Map(aliases.flatMap(group => group.map(name => [name, group[0]])));
const teamKey = value => names.get(normalize(value)) || normalize(value);
const own = (object, key) => object && Object.hasOwn(object, key) ? object[key] : undefined;
const REQUIRED = ['points', 'gamesPlayed', 'wins', 'ties', 'losses', 'pointDifferential'];
const STAT_ALIASES = {
  pointDifferential: ['pointDifferential', 'goalDifference'],
  pointsFor: ['pointsFor', 'goalsFor'],
  pointsAgainst: ['pointsAgainst', 'goalsAgainst']
};

function integer(value, signed = false) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && (signed || number >= 0) ? number : null;
}

function statValue(stats, key) {
  for (const name of STAT_ALIASES[key] || [key]) {
    const value = integer(stats[name], key === 'pointDifferential');
    if (value !== null) return value;
  }
  return null;
}

function copyRow(row, index) {
  const source = row?.stats && typeof row.stats === 'object' ? row.stats : {};
  const stats = { ...source };
  for (const [key, value] of Object.entries(stats)) {
    const numeric = integer(value, true);
    if (numeric !== null) stats[key] = numeric;
  }
  for (const key of [...REQUIRED, 'pointsFor', 'pointsAgainst']) stats[key] = statValue(source, key);
  const realRank = integer(row?.rank) || index + 1;
  return { ...row, teamName: String(row?.teamName || ''), stats,
    realRank, realPoints: stats.points, rank: realRank, tied: false };
}

function completeScore(pair) {
  return Array.isArray(pair) && pair.length === 2
    && pair.every(value => Number.isInteger(value) && value >= 0 && value <= 99);
}

function changeStats(row, goalsFor, goalsAgainst, direction = 1, countGame = true) {
  const stats = row.stats;
  if (countGame) stats.gamesPlayed += direction;
  stats.pointDifferential += direction * (goalsFor - goalsAgainst);
  if (stats.pointsFor !== null) stats.pointsFor += direction * goalsFor;
  if (stats.pointsAgainst !== null) stats.pointsAgainst += direction * goalsAgainst;
  if (goalsFor > goalsAgainst) { stats.points += direction * 3; stats.wins += direction; }
  else if (goalsFor === goalsAgainst) { stats.points += direction; stats.ties += direction; }
  else stats.losses += direction;
  for (const [key, fields] of Object.entries(STAT_ALIASES)) {
    for (const field of fields) if (Object.hasOwn(stats, field)) stats[field] = stats[key];
  }
}

function rankRows(rows) {
  const realOrder = new Map(rows.map((row, index) => [row, index]));
  const byRealRank = (a, b) => a.realRank - b.realRank || realOrder.get(a) - realOrder.get(b);
  const primary = ['points', 'wins', 'pointDifferential'];
  // Missing required stats cannot support a new ranking: retain the source's order.
  if (rows.some(row => primary.some(key => row.stats[key] === null))) {
    rows.sort(byRealRank);
    rows.forEach(row => { row.tied = true; });
  } else {
    rows.sort((a, b) => {
      for (const key of primary) if (a.stats[key] !== b.stats[key]) return b.stats[key] - a.stats[key];
      return byRealRank(a, b);
    });
    for (let start = 0; start < rows.length;) {
      let end = start + 1;
      while (end < rows.length && primary.every(key => rows[start].stats[key] === rows[end].stats[key])) end++;
      const group = rows.slice(start, end);
      if (group.length > 1) {
        if (group.every(row => row.stats.pointsFor !== null)) {
          group.sort((a, b) => b.stats.pointsFor - a.stats.pointsFor || byRealRank(a, b));
          for (let i = 0; i < group.length; i++) {
            group[i].tied = (i > 0 && group[i - 1].stats.pointsFor === group[i].stats.pointsFor)
              || (i + 1 < group.length && group[i + 1].stats.pointsFor === group[i].stats.pointsFor);
          }
        } else {
          // Sorting pairwise by GF when only some teams have GF is not transitive.
          // Keep the whole tied block in real order until every GF is known.
          group.sort(byRealRank);
          group.forEach(row => { row.tied = true; });
        }
        rows.splice(start, group.length, ...group);
      }
      start = end;
    }
  }
  rows.forEach((row, index) => { row.rank = index + 1; row.stats.rank = row.rank; });
  return rows.some(row => row.tied);
}

/**
 * Apply a participant's complete guesses to a copy of the real league table.
 * Scheduled games add a result. Confirmed 90-minute results already in the table
 * are replaced by the guess, keeping games played unchanged.
 * pendingCount: missing guess, fresh status, team or required table statistics.
 * skippedCount: in progress or duplicate fixtures.
 * Other competitions, seasons, rounds and archived fixtures do not enter counts.
 */
export function projectStandings(rows, {
  fixtures = [], predictions = {}, participantId, officialResults = {}, season
} = {}) {
  const projected = (Array.isArray(rows) ? rows : []).map(copyRow);
  let appliedCount = 0, pendingCount = 0, skippedCount = 0, completedCount = 0, futureCount = 0;
  if (!participantId || !/^\d{4}$/.test(String(season || ''))) {
    return { rows: projected, appliedCount, pendingCount, skippedCount, completedCount, futureCount, tied: false,
      reason: 'Escolha o participante e a temporada.' };
  }
  const teams = new Map();
  for (const row of projected) {
    const key = teamKey(row.teamName);
    // An ambiguous source name must never receive a guessed result twice.
    teams.set(key, teams.has(key) ? null : row);
  }
  const realGames = new Map(projected.map(row => [row, row.stats.gamesPlayed]));
  const seenIds = new Set(), seenGames = new Set();
  const candidates = (Array.isArray(fixtures) ? fixtures : []).filter(game => game
    && game.competition === 'brasileirao' && String(game.season) === String(season)
    && !game.archived && [37, 38].includes(Number(game.round)))
    .sort((a, b) => Number(a.round) - Number(b.round));
  for (const game of candidates) {
    const round = Number(game.round), homeKey = teamKey(game.home), awayKey = teamKey(game.away);
    const identity = `${round}:${[homeKey, awayKey].sort().join(':')}`;
    if (seenIds.has(game.id) || seenGames.has(identity)) { skippedCount++; continue; }
    if (typeof game.id !== 'string' || !game.id || !homeKey || !awayKey || homeKey === awayKey) {
      pendingCount++; continue;
    }
    seenIds.add(game.id); seenGames.add(identity);
    const home = teams.get(homeKey), away = teams.get(awayKey);
    const actual = own(officialResults, game.id);
    if (actual?.state === 'in') { skippedCount++; continue; }
    const pair = own(own(predictions, game.id), participantId);
    if (!home || !away || REQUIRED.some(key => home.stats[key] === null || away.stats[key] === null)
      || !actual || actual.stale || !completeScore(pair)) {
      pendingCount++; continue;
    }
    // GP always comes from the real snapshot, never from preceding guesses.
    const homeGames = realGames.get(home), awayGames = realGames.get(away);
    const scheduled = actual.state === 'pre' && !actual.completed && homeGames < round && awayGames < round;
    const realScore = [actual.homeScore, actual.awayScore];
    const alreadyCounted = (actual.completed === true || actual.state === 'post')
      && actual.regulationConfirmed === true && completeScore(realScore)
      && homeGames >= round && awayGames >= round;
    if (!scheduled && !alreadyCounted) { pendingCount++; continue; }
    if (alreadyCounted) {
      // Validate the replacement on copies before touching either projected team.
      const replacements = [home, away].map(row => ({ ...row, stats: { ...row.stats } }));
      changeStats(replacements[0], realScore[0], realScore[1], -1, false);
      changeStats(replacements[1], realScore[1], realScore[0], -1, false);
      // A negative counter indicates the snapshot cannot contain this result.
      const counters = ['wins', 'ties', 'losses', 'pointsFor', 'pointsAgainst'];
      if (replacements.some(row => counters.some(key => row.stats[key] !== null && row.stats[key] < 0))) {
        pendingCount++; continue;
      }
      changeStats(replacements[0], pair[0], pair[1], 1, false);
      changeStats(replacements[1], pair[1], pair[0], 1, false);
      home.stats = replacements[0].stats; away.stats = replacements[1].stats;
      completedCount++;
    } else {
      changeStats(home, pair[0], pair[1]); changeStats(away, pair[1], pair[0]);
      futureCount++;
    }
    appliedCount++;
  }
  const tied = rankRows(projected);
  let reason = appliedCount ? 'Simulação com os palpites salvos; a tabela real foi preservada.' : 'Nenhum palpite aplicado à tabela real.';
  if (pendingCount) reason += ' Há jogos ou dados pendentes.';
  if (tied) reason += ' Empate técnico: ordem real mantida nos critérios restantes.';
  else reason += ' Ordem provisória.';
  return { rows: projected, appliedCount, pendingCount, skippedCount, completedCount, futureCount, tied, reason };
}
