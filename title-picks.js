import { enhanceScoreInput } from './score-input.js?v=20261128-digitacao';

let titlePicksInstance = 0;

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fieldKey(participantId, itemId, index) {
  return JSON.stringify([participantId, itemId, index ?? null]);
}

function validGoal(value) {
  return value === null || (Number.isInteger(value) && value >= 0 && value <= 99);
}

function completeScore(value) {
  return Array.isArray(value) && value.length === 2
    && value.every(goal => Number.isInteger(goal) && goal >= 0 && goal <= 99);
}

function teamKey(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function safeSource(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/**
 * Championship picks and final-score predictions above the standings.
 * Persistence belongs to onPick/onScore. A false result reports failure.
 * Controller updates only mirror existing app state; they never fire callbacks.
 * competitions[].champion must be the real champion. Score comparisons require
 * completed, regulationConfirmed and a complete numeric officialScore.
 */
export function mountTitlePicks(container, {
  season = '2026', participants = [], competitions = [], finals = [], onPick, onScore,onCommit
} = {}) {
  const instance = ++titlePicksInstance;
  const people = participants.filter(person => person && typeof person.id === 'string' && typeof person.name === 'string');
  const tournaments = competitions.filter(item => item && typeof item.key === 'string');
  const games = finals.filter(item => item && typeof item.id === 'string');
  const picks = new Map();
  const scores = new Map();
  const officialNodes = new Map();
  const officialScores = new Map();
  const actualChampions = new Map();
  const scoreComparisons = new Map();
  const statusNodes = new Map();
  const attempts = new Map();
  const wrapper = create('div', 'title-picks');
  const heading = create('h3', 'title-picks__heading', `Palpites de campeões · ${season}`);
  heading.id = `title-picks-heading-${instance}`;
  wrapper.setAttribute('aria-labelledby', heading.id);
  wrapper.append(heading,
    create('p', 'title-picks__intro', 'Escolha os campeões e os placares das finais. Use Enter para avançar de placar. Os palpites são salvos automaticamente.'));

  function showComparison(node, text = '', correct = false) {
    if (!node) return;
    node.textContent = text;
    node.hidden = !text;
    node.classList.toggle('title-picks__comparison--correct', correct);
  }

  function compareChampion(participantId, key) {
    const field = picks.get(fieldKey(participantId, key));
    if (!field) return;
    const champion = actualChampions.get(key), choice = field.input.value;
    if (!champion || !choice) { showComparison(field.comparison); return; }
    const correct = teamKey(champion) === teamKey(choice);
    showComparison(field.comparison, correct ? 'Acertou o campeão!' : `Campeão real: ${champion}`, correct);
  }

  function compareScore(participantId, fixtureId) {
    const node = scoreComparisons.get(fieldKey(participantId, fixtureId));
    const actual = officialScores.get(fixtureId);
    if (!node) return;
    if (!actual?.completed || !actual.regulationConfirmed || !completeScore(actual.score)) {
      showComparison(node); return;
    }
    const fields = [0, 1].map(index => scores.get(fieldKey(participantId, fixtureId, index))?.input);
    if (fields.some(input => !input || !input.validity.valid || input.value === '')) {
      showComparison(node); return;
    }
    const prediction = fields.map(input => Number(input.value));
    if (!completeScore(prediction)) { showComparison(node); return; }
    const correct = prediction.every((goal, index) => goal === actual.score[index]);
    showComparison(node, correct ? 'Acertou o placar!' : `Resultado real: ${actual.score[0]} × ${actual.score[1]}`, correct);
  }

  function updateChampions(nextCompetitions) {
    let updated = 0;
    for (const tournament of Array.isArray(nextCompetitions) ? nextCompetitions : []) {
      if (!tournament || !tournaments.some(item => item.key === tournament.key)) continue;
      const champion = typeof tournament.champion === 'string' ? tournament.champion.trim() : '';
      if (champion && champion.length <= 100) actualChampions.set(tournament.key, champion);
      else actualChampions.delete(tournament.key);
      people.forEach(person => compareChampion(person.id, tournament.key));
      updated++;
    }
    return updated;
  }

  function status(participantId, message, failed = false) {
    const node = statusNodes.get(participantId);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('title-picks__status--error', failed);
  }

  async function save(participantId, callback, args) {
    const attempt = (attempts.get(participantId) || 0) + 1;
    attempts.set(participantId, attempt);
    status(participantId, 'Salvando palpite…');
    try {
      if (typeof callback !== 'function') throw new Error('Persistence callback is unavailable');
      const result = await callback(...args);
      if (attempts.get(participantId) !== attempt) return;
      if (result === false) throw new Error('Persistence failed');
      status(participantId, 'Palpite salvo neste navegador.');
    } catch {
      if (attempts.get(participantId) === attempt) {
        status(participantId, 'Não foi possível salvar. Exporte o histórico para guardar seus palpites.', true);
      }
    }
  }

  function setPick(participantId, key, value) {
    const field = picks.get(fieldKey(participantId, key));
    if (!field || typeof value !== 'string' || value.length > 100) return false;
    if (value && !Array.from(field.input.options).some(option => option.value === value)) {
      const historical = create('option', '', value);
      historical.value = value;
      historical.dataset.savedPick = 'true';
      field.input.append(historical);
    }
    field.input.value = value;
    field.readout.textContent = value || 'A definir';
    field.readout.title = value || 'Palpite ainda não informado';
    compareChampion(participantId, key);
    return true;
  }

  function setScore(participantId, fixtureId, index, value) {
    const field = scores.get(fieldKey(participantId, fixtureId, index));
    if (!field || !validGoal(value)) return false;
    field.control.setValue(value);
    field.readout.textContent = value === null ? '—' : String(value);
    compareScore(participantId, fixtureId);
    return true;
  }

  const grid = create('div', 'title-picks__grid');
  people.forEach((person, personIndex) => {
    const card = create('article', 'title-picks__card');
    const name = create('h4', 'title-picks__person', person.name);
    name.id = `title-picks-person-${instance}-${personIndex}`;
    card.setAttribute('aria-labelledby', name.id);
    card.append(name);
    const choices = create('div', 'title-picks__choices');
    tournaments.forEach(tournament => {
      const label = create('label', 'title-picks__choice');
      label.append(create('span', 'title-picks__competition', tournament.label || tournament.key));
      const select = create('select', 'title-picks__edit title-picks__select');
      select.setAttribute('aria-label', `Campeão de ${tournament.label || tournament.key} · ${person.name}`);
      select.dataset.participantId = person.id;
      select.dataset.competitionKey = tournament.key;
      const teams = Array.isArray(tournament.teams)
        ? [...new Set(tournament.teams.filter(team => typeof team === 'string' && team.trim()))]
        : [];
      const empty = create('option', '', teams.length ? 'Escolha o campeão' : 'Aguardando definição');
      empty.value = '';
      select.append(empty);
      teams.forEach(team => { const option = create('option', '', team); option.value = team; select.append(option); });
      select.disabled = teams.length === 0;
      const readout = create('span', 'title-picks__readout title-picks__champion');
      const comparison = create('span', 'title-picks__comparison');
      comparison.hidden = true; comparison.setAttribute('role', 'status');
      label.append(select, readout, comparison);
      choices.append(label);
      picks.set(fieldKey(person.id, tournament.key), { input: select, readout, comparison });
      setPick(person.id, tournament.key, typeof tournament.picks?.[person.id] === 'string' ? tournament.picks[person.id] : '');
      select.addEventListener('change', () => {
        setPick(person.id, tournament.key, select.value);
        void save(person.id, onPick, [person.id, tournament.key, select.value]);
      });
    });
    card.append(choices);

    const scoreGrid = create('div', 'title-picks__scores');
    games.forEach(game => {
      const fieldset = create('fieldset', 'title-picks__final-pick');
      fieldset.append(create('legend', '', `Palpite · ${game.title || 'Final'}`));
      const comparison = create('p', 'title-picks__comparison title-picks__score-comparison');
      comparison.hidden = true; comparison.setAttribute('role', 'status');
      scoreComparisons.set(fieldKey(person.id, game.id), comparison);
      const match = create('div', 'title-picks__score-match');
      [game.home || 'Mandante', game.away || 'Visitante'].forEach((team, index) => {
        if (index) match.append(create('span', 'title-picks__versus', '×'));
        const label = create('label', 'title-picks__team-score');
        label.append(create('span', 'title-picks__team-name', team));
        const input = create('input', 'title-picks__edit title-picks__goal');
        input.setAttribute('aria-label', `Palpite ${person.name}: ${team} (${game.title || 'Final'})`);
        input.dataset.participantId = person.id;
        input.dataset.fixtureId = game.id;
        input.dataset.scoreIndex = String(index);
        const readout = create('span', 'title-picks__readout title-picks__goal-readout');
        label.append(input, readout); match.append(label);
        const control=enhanceScoreInput(input,{
          onCommit:()=>onCommit?.(),
          onValue:value=>{
            readout.textContent = value === null ? '—' : String(value);
            compareScore(person.id, game.id);
            void save(person.id, onScore, [person.id, game.id, index, value]);
          },
          onNext:()=>{
            const inputs=[...scores.values()].map(field=>field.input).filter(field=>field.dataset.participantId===person.id);
            const next=inputs[inputs.indexOf(input)+1];
            if(next)next.focus();else input.blur();
          }
        });
        scores.set(fieldKey(person.id, game.id, index), { input, readout,control });
        const initial = game.predictions?.[person.id]?.[index];
        setScore(person.id, game.id, index, validGoal(initial) ? initial : null);
      });
      fieldset.append(match, comparison); scoreGrid.append(fieldset);
    });
    if (games.length) card.append(scoreGrid);
    const feedback = create('p', 'title-picks__status');
    feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    statusNodes.set(person.id, feedback); card.append(feedback);
    grid.append(card);
  });
  if (!people.length) grid.append(create('p', 'title-picks__empty', 'Adicione participantes para registrar os palpites.'));
  wrapper.append(grid);

  const officialGrid = create('div', 'title-picks__officials');
  games.forEach(game => {
    const card = create('article', 'title-picks__official');
    card.dataset.fixtureId = game.id;
    card.append(create('h4', 'title-picks__official-heading', `Resultado real · ${game.title || 'Final'}`),
      create('p', 'title-picks__official-match', `${game.home || 'Mandante'} × ${game.away || 'Visitante'}`));
    const kickoff = create('p', 'title-picks__kickoff', game.kickoffText || '');
    const result = create('p', 'title-picks__actual'); result.setAttribute('role', 'status');
    const winner = create('p', 'title-picks__winner');
    const source = create('a', 'title-picks__source', 'Conferir resultado');
    source.target = '_blank'; source.rel = 'noopener noreferrer';
    card.append(kickoff, result, winner, source); officialGrid.append(card);
    officialNodes.set(game.id, { kickoff, result, winner, source });
  });
  if (games.length) wrapper.append(officialGrid);

  function updateOfficialResults(nextFinals) {
    let updated = 0;
    for (const game of Array.isArray(nextFinals) ? nextFinals : []) {
      const nodes = game && officialNodes.get(game.id);
      if (!nodes) continue;
      nodes.result.textContent = typeof game.officialText === 'string' && game.officialText
        ? game.officialText : 'Resultado ainda não informado.';
      nodes.winner.textContent = typeof game.winnerText === 'string' && game.winnerText
        ? game.winnerText : game.completed === true && typeof game.winner === 'string' && game.winner.trim()
          ? `Campeão real: ${game.winner.trim()}` : '';
      nodes.winner.hidden = !nodes.winner.textContent;
      if (typeof game.kickoffText === 'string') nodes.kickoff.textContent = game.kickoffText;
      const url = safeSource(game.sourceUrl);
      nodes.source.hidden = !url;
      if (url) nodes.source.href = url;
      else nodes.source.removeAttribute('href');
      officialScores.set(game.id, {
        completed: game.completed === true,
        regulationConfirmed: game.regulationConfirmed === true,
        score: completeScore(game.officialScore) ? [...game.officialScore] : null
      });
      people.forEach(person => compareScore(person.id, game.id));
      updated++;
    }
    return updated;
  }

  updateOfficialResults(games);
  updateChampions(tournaments);
  container.replaceChildren(wrapper);
  return { setPick, setScore, updateOfficialResults, updateChampions };
}
