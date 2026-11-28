// Read-only scoreboard data. Predictions and manually entered results belong to the app.
const LEAGUES = {
  brasileirao: 'bra.1',
  libertadores: 'conmebol.libertadores',
  'copa-brasil': 'bra.copa_do_brazil'
};
const CACHE_VERSION = 1;
const CACHE_TTL = 3 * 60 * 1000;
const memoryCache = new Map();
const inFlight = new Map();
const REGULATION_CACHE_TTL = 15 * 60 * 1000;
const REGULATION_RETRY_TTL = 60 * 1000;
const regulationCache = new Map();
const regulationInFlight = new Map();

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

const TEAM_ALIASES = [
  ['atleticomg', 'atleticomineiro', 'clubatleticomineiro', 'cam'],
  ['athleticopr', 'athleticoparanaense', 'atleticoparanaense', 'cap'],
  ['vascodagama', 'vasco', 'crvascodagama', 'vas'],
  ['redbullbragantino', 'rbbragantino', 'bragantino', 'rbb'],
  ['estudiantes', 'estudiantesdelaplata', 'estudianteslp', 'est'],
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
const canonicalTeams = new Map(TEAM_ALIASES.flatMap(names => names.map(name => [name, names[0]])));
const canonical = value => canonicalTeams.get(normalize(value)) || normalize(value);

function numberScore(value) {
  if (value && typeof value === 'object') value = value.value ?? value.displayValue;
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 999 ? number : null;
}

function safeSource(links, fallback) {
  for (const link of links || []) {
    try {
      const url = new URL(link.href);
      if (url.protocol === 'https:' && /(^|\.)espn\.(com|com\.br)$/i.test(url.hostname)) return url.href;
    } catch {}
  }
  return fallback;
}

function formatTime(value, zone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: zone, dateStyle: 'short', timeStyle: 'short'
  }).format(new Date(value));
}

function brazilDate(value) {
  if (!Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = name => parts.find(value => value.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function normalizeEvent(event, league) {
  const competition = event?.competitions?.find(item => Array.isArray(item.competitors) && item.competitors.length === 2);
  if (!competition) return null;
  const year = Number(event.season?.year);
  if (!Number.isInteger(year)) return null;
  const competitors = competition.competitors.map(person => {
    const team = person.team || {};
    return {
      side: person.homeAway,
      names: [...new Set([team.displayName, team.shortDisplayName, team.name, team.abbreviation]
        .filter(name => typeof name === 'string' && name.trim()).map(canonical))],
      score: numberScore(person.score),
      shootoutScore: numberScore(person.shootoutScore ?? person.shootOutScore),
      winner: person.winner === true
    };
  });
  if (competitors.some(person => !person.names.length)
    || competitors.filter(person => person.side === 'home').length !== 1
    || competitors.filter(person => person.side === 'away').length !== 1) return null;
  const status = competition.status?.type ? competition.status : event.status || competition.status || {};
  const type = status.type || {};
  return {
    id: String(event.id || competition.id || ''), year,
    date: typeof event.date === 'string' ? event.date : '',
    state: ['pre', 'in', 'post'].includes(type.state) ? type.state : 'unknown',
    completed: type.completed === true,
    statusName: String(type.name || ''),
    detail: String(type.detail || type.description || ''),
    period: Number.isFinite(Number(status.period)) ? Number(status.period) : null,
    clock: typeof status.displayClock === 'string' ? status.displayClock : '',
    competitors,
    sourceUrl: safeSource([...(event.links || []), ...(competition.links || [])],
      `https://www.espn.com.br/futebol/placar/_/liga/${league}`)
  };
}

function validCachedEvent(event) {
  return event && typeof event.id === 'string' && Number.isInteger(event.year)
    && typeof event.date === 'string' && Number.isFinite(Date.parse(event.date))
    && ['pre', 'in', 'post', 'unknown'].includes(event.state)
    && typeof event.completed === 'boolean' && typeof event.statusName === 'string'
    && typeof event.detail === 'string' && typeof event.clock === 'string'
    && Array.isArray(event.competitors) && event.competitors.length === 2
    && event.competitors.filter(person => person?.side === 'home').length === 1
    && event.competitors.filter(person => person?.side === 'away').length === 1
    && event.competitors.every(person => person && ['home', 'away'].includes(person.side)
      && Array.isArray(person.names) && person.names.length && person.names.every(name => typeof name === 'string')
      && (person.score === null || numberScore(person.score) === person.score)
      && (person.shootoutScore === null || numberScore(person.shootoutScore) === person.shootoutScore)
      && typeof person.winner === 'boolean')
    && typeof event.sourceUrl === 'string';
}

function readCache(key, league, date) {
  let cached = memoryCache.get(key);
  if (!cached) {
    try { cached = JSON.parse(globalThis.localStorage?.getItem(key) || 'null'); } catch {}
  }
  if (!cached || cached.version !== CACHE_VERSION || cached.league !== league || cached.date !== date
    || !Number.isFinite(Date.parse(cached.fetchedAt)) || Date.parse(cached.fetchedAt) > Date.now() + 5 * 60 * 1000
    || !Array.isArray(cached.events) || cached.events.length > 500 || !cached.events.every(validCachedEvent)) return null;
  memoryCache.set(key, cached);
  return cached;
}

async function fetchGroup(league, date, force) {
  const key = `catimba:scoreboard:${league}:${date}`;
  const cached = readCache(key, league, date);
  const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
  if (!force && age >= 0 && age < CACHE_TTL) return { ...cached, stale: false, error: '' };
  if (inFlight.has(key)) return inFlight.get(key);
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${date}&limit=100`;
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.events)) throw new Error('Resposta sem lista de jogos');
      const value = {
        version: CACHE_VERSION, league, date, fetchedAt: new Date().toISOString(),
        events: payload.events.map(event => normalizeEvent(event, league)).filter(Boolean)
      };
      memoryCache.set(key, value);
      try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch {}
      return { ...value, stale: false, error: '' };
    } catch {
      if (cached) return { ...cached, stale: true, error: `Não foi possível atualizar ${league} em ${date}.` };
      return { league, date, events: [], fetchedAt: null, stale: true,
        error: `Não foi possível consultar ${league} em ${date}.` };
    } finally { clearTimeout(timer); }
  })();
  inFlight.set(key, request);
  try { return await request; } finally { inFlight.delete(key); }
}

function matchEvent(event, fixture) {
  if (event.year !== Number(fixture.season) || brazilDate(event.date) !== fixture.kickoff.slice(0, 10)) return null;
  const homeName = canonical(fixture.home), awayName = canonical(fixture.away);
  if (!homeName || !awayName || homeName === awayName) return null;
  const home = event.competitors.find(person => person.names.includes(homeName));
  const away = event.competitors.find(person => person.names.includes(awayName));
  // The API can reverse the nominal sides of a final at a neutral stadium.
  return home && away && home !== away ? { event, home, away } : null;
}

function statusLabel(event) {
  const status = `${event.statusName} ${event.detail}`;
  if (/POSTPON/i.test(status)) return 'Adiado';
  if (/CANCEL/i.test(status)) return 'Cancelado';
  if (/ABANDON/i.test(status)) return 'Abandonado';
  if (/SUSPEND|DELAY/i.test(status)) return 'Interrompido';
  if (event.completed) return 'Encerrado';
  if (event.state === 'in') return 'Ao vivo';
  return 'Agendado';
}

function phaseText(event, home, away) {
  const status = `${event.statusName} ${event.detail}`;
  const penalties = /PENALT|SHOOT|PEN\b/i.test(status)
    || (home.shootoutScore !== null && away.shootoutScore !== null);
  const extraTime = /EXTRA|OVERTIME|\bAET\b|PRORROGA/i.test(status)
    || (!penalties && event.period >= 3 && event.period <= 4);
  if (penalties) {
    if (home.shootoutScore !== null && away.shootoutScore !== null)
      return `Pênaltis: ${home.shootoutScore} × ${away.shootoutScore}`;
    return event.completed ? 'Decidido nos pênaltis' : 'Disputa de pênaltis';
  }
  return extraTime ? 'Placar inclui prorrogação' : '';
}

function blockedResult(event) {
  return /POSTPON|CANCEL|ABANDON|SUSPEND|DELAY|AWARDED|WALKOVER/i
    .test(`${event.statusName} ${event.detail}`);
}

function summaryRegulationScore(payload, event) {
  const header = payload?.header;
  if (String(header?.id) !== event.id || Number(header?.season?.year) !== event.year
    || Number(payload?.format?.regulation?.periods) !== 2
    || Number(payload?.format?.regulation?.clock) !== 2700) return null;
  const games = (header.competitions || []).filter(game => String(game.id) === event.id);
  if (games.length !== 1) return null;
  const game = games[0], status = game.status?.type;
  if (brazilDate(game.date) !== brazilDate(event.date) || status?.completed !== true
    || /CANCEL|ABANDON|SUSPEND|AWARDED|WALKOVER/i.test(`${status.name} ${status.detail}`)
    || !Array.isArray(game.competitors) || game.competitors.length !== 2) return null;
  const competitors = event.competitors.map(expected => {
    const matches = game.competitors.filter(person => [person.team?.displayName,
      person.team?.shortDisplayName, person.team?.name, person.team?.abbreviation]
      .some(name => typeof name === 'string' && expected.names.includes(canonical(name))));
    return matches.length === 1 ? matches[0] : null;
  });
  if (competitors.some(person => !person) || competitors[0] === competitors[1]
    || competitors.some((person, index) => numberScore(person.score) !== event.competitors[index].score)) return null;
  const ids = competitors.map(person => String(person.team?.id ?? person.id ?? ''));
  if (ids.some(id => !id) || ids[0] === ids[1]) return null;
  const events = payload.keyEvents;
  if (!Array.isArray(events) || !events.some(play => Number(play.period?.number) === 2
    && play.type?.type === 'end-regular-time' && play.shootout === false)) return null;
  const allGoals = [0, 0], regularGoals = [0, 0], seen = new Set();
  for (const play of events.filter(play => play.scoringPlay === true)) {
    const period = Number(play.period?.number);
    if (play.shootout === true || period >= 5) continue;
    const type = String(play.type?.type || '');
    if (!Number.isInteger(period) || period < 1 || period > 4 || play.shootout !== false
      || !/^(goal(?:---[a-z-]+)?|own-goal|penalty---scored)$/.test(type)
      || /disallow|cancel|review|no.goal/i.test(`${type} ${play.text || ''}`)
      || typeof play.id !== 'string' || !play.id || seen.has(play.id)) return null;
    seen.add(play.id);
    const side = ids.indexOf(String(play.team?.id ?? ''));
    if (side < 0) return null;
    // ESPN keyEvents.team is the beneficiary, including own goals. Do not invert it.
    allGoals[side]++;
    if (period <= 2) regularGoals[side]++;
  }
  if (allGoals.some((goals, side) => goals !== event.competitors[side].score)) return null;
  return regularGoals;
}

async function fetchRegulationScore(event, league) {
  const key = `catimba:regulation:${league}:${event.id}`;
  const signature = JSON.stringify([event.id, event.year, event.date, event.statusName,
    event.detail, event.competitors.map(person => [person.side, person.names, person.score, person.shootoutScore])]);
  const flightKey = `${key}:${signature}`;
  let cached = regulationCache.get(key);
  if (!cached) { try { cached = JSON.parse(globalThis.localStorage?.getItem(key) || 'null'); } catch {} }
  const validPair = pair => Array.isArray(pair) && pair.length === 2
    && pair.every(value => Number.isInteger(value) && value >= 0 && value <= 999);
  if (!cached || cached.version !== 1 || cached.signature !== signature
    || !Number.isFinite(Date.parse(cached.fetchedAt))
    || Date.parse(cached.fetchedAt) > Date.now() + 5 * 60 * 1000
    || (cached.score !== null && !validPair(cached.score))) cached = null;
  const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
  // Scoreboard polling can force a fresh feed every minute without reloading a
  // confirmed finished game's detail every minute. A changed score invalidates it.
  if (cached && age >= 0 && age < (cached.score ? REGULATION_CACHE_TTL : REGULATION_RETRY_TTL)) {
    regulationCache.set(key, cached);
    return { score: cached.score, fetchedAt: cached.fetchedAt, stale: false };
  }
  if (regulationInFlight.has(flightKey)) return regulationInFlight.get(flightKey);
  const task = (async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      if (!/^\d+$/.test(event.id)) throw new Error('Invalid event id');
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${event.id}`,
        { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Summary unavailable');
      const score = summaryRegulationScore(await response.json(), event);
      const value = { version: 1, signature, score, fetchedAt: new Date().toISOString() };
      regulationCache.set(key, value);
      try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch {}
      return { score, fetchedAt: value.fetchedAt, stale: false };
    } catch {
      if (cached?.score) return { score: cached.score, fetchedAt: cached.fetchedAt, stale: true };
      const value = { version: 1, signature, score: null, fetchedAt: new Date().toISOString() };
      regulationCache.set(key, value);
      return { score: null, fetchedAt: value.fetchedAt, stale: true };
    } finally { clearTimeout(timer); }
  })();
  regulationInFlight.set(flightKey, task);
  try { return await task; } finally { regulationInFlight.delete(flightKey); }
}

function displayResult(fixture, match, group) {
  const { event, home, away } = match;
  const activeScore = (event.state === 'in' || event.state === 'post' || event.completed)
    && home.score !== null && away.score !== null;
  const label = statusLabel(event);
  let text = activeScore
    ? `${label} · ${fixture.home} ${home.score} × ${away.score} ${fixture.away}`
    : `${label} · ${formatTime(fixture.kickoff)} (Brasília)`;
  const phase = phaseText(event, home, away);
  if (activeScore && phase) text += ` · ${phase}`;
  else if (event.state === 'in' && event.clock && event.clock !== "0'") text += ` · ${event.clock}`;
  if (group.stale) text += ` · cópia de ${formatTime(group.fetchedAt, 'Europe/Lisbon')} (Lisboa)`;
  const isFinal = fixture.round === 'final' || /:final:/.test(fixture.id);
  const winners = [home, away].filter(person => person.winner);
  const winner = event.completed && event.state === 'post' && !blockedResult(event) && winners.length === 1
    ? (winners[0] === home ? fixture.home : fixture.away) : '';
  const regulationConfirmed = event.completed && event.state === 'post' && activeScore && !phase && !blockedResult(event)
    && (/FULL_TIME|FINAL_REGULATION/i.test(event.statusName) || event.period === 2);
  return {
    officialText: text,
    winnerText: winner && isFinal ? `Campeão: ${winner}` : '',
    winner: winner || null,
    homeScore: activeScore ? home.score : null,
    awayScore: activeScore ? away.score : null,
    state: event.state, completed: event.completed,
    regulationConfirmed,
    regulationScore: regulationConfirmed ? [home.score, away.score] : null,
    eventId: event.id,
    sourceUrl: safeSource([{ href: event.sourceUrl }],
      `https://www.espn.com.br/futebol/placar/_/liga/${group.league}`),
    fetchedAt: group.fetchedAt, stale: group.stale
  };
}

/** Fetch official-feed results without changing guesses, manual scores or the ranking. */
export async function fetchMatchResults(fixtures, { force = false } = {}) {
  const fetchedAt = new Date().toISOString();
  const results = {}, errors = [], groups = new Map(), regulationJobs = [];
  for (const fixture of Array.isArray(fixtures) ? fixtures : []) {
    const league = LEAGUES[fixture?.competition];
    if (!fixture?.id || !league || !/^\d{4}-\d{2}-\d{2}T/.test(fixture.kickoff || '')
      || !Number.isFinite(Date.parse(fixture.kickoff)) || String(fixture.season) !== fixture.kickoff.slice(0, 4)) {
      if (fixture?.id && !fixture.archived) errors.push(`Calendário não configurado para ${fixture.id}.`);
      continue;
    }
    const date = fixture.kickoff.slice(0, 10).replaceAll('-', '');
    const key = `${league}:${date}`;
    if (!groups.has(key)) groups.set(key, { league, date, fixtures: [] });
    groups.get(key).fixtures.push(fixture);
  }
  const requested = [...groups.values()];
  const settled = await Promise.allSettled(requested.map(group => fetchGroup(group.league, group.date, force)));
  settled.forEach((settledGroup, index) => {
    const request = requested[index];
    const group = settledGroup.status === 'fulfilled' ? settledGroup.value
      : { ...request, events: [], fetchedAt: null, stale: true, error: 'Não foi possível consultar a fonte.' };
    if (group.error) errors.push(group.error);
    for (const fixture of request.fixtures) {
      const matches = group.events.map(event => matchEvent(event, fixture)).filter(Boolean);
      if (matches.length === 1) {
        const match = matches[0], result = displayResult(fixture, match, group);
        results[fixture.id] = result;
        if (match.event.completed && match.event.state === 'post' && !result.regulationConfirmed && !blockedResult(match.event)
          && result.homeScore !== null && result.awayScore !== null) {
          result.regulationPending = true;
          regulationJobs.push((async () => {
            const detail = await fetchRegulationScore(match.event, request.league);
            if (detail.score) {
              result.regulationScore = [detail.score[match.event.competitors.indexOf(match.home)],
                detail.score[match.event.competitors.indexOf(match.away)]];
              result.regulationConfirmed = true;
              result.regulationPending = false;
              result.regulationFetchedAt = detail.fetchedAt;
              result.regulationStale = detail.stale;
            } else errors.push(`Aguardando confirmação dos 90 minutos de ${fixture.home} × ${fixture.away}.`);
          })());
        }
      }
      else {
        errors.push(`Resultado não localizado de forma única para ${fixture.home} × ${fixture.away}.`);
        results[fixture.id] = {
          officialText: 'Sem atualização da fonte para este jogo.', winnerText: '', winner: null,
          homeScore: null, awayScore: null, regulationScore: null,
          regulationConfirmed: false, state: 'unavailable', completed: false,
          sourceUrl: `https://www.espn.com.br/futebol/placar/_/liga/${request.league}`,
          fetchedAt: group.fetchedAt, stale: group.stale
        };
      }
    }
  });
  await Promise.all(regulationJobs);
  return { results, errors, fetchedAt };
}
