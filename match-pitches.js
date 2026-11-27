let matchPitchInstance = 0;

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sourceLink(team) {
  try {
    const url = new URL(team.sourceUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const link = create('a', 'match-pitches__source-link', team.sourceLabel || 'Consultar fonte');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  } catch { return null; }
}

function nameKey(name) {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function initials(name) {
  return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => Array.from(part)[0]).join('').toLocaleUpperCase('pt-BR');
}

function clubClass(name) {
  const value = nameKey(name);
  if (value.includes('palmeiras')) return ' match-pitches__team--palmeiras';
  if (value.includes('estudiantes')) return ' match-pitches__team--estudiantes';
  return '';
}

function clonePlayers(players) {
  return players.map(player => ({ name: player.name, position: player.position, row: player.row }));
}

function cloneLineup(lineup) {
  return { players: clonePlayers(lineup.players), formation: lineup.formation };
}

function validEdit(value, playerCount) {
  if (!value || !Array.isArray(value.players) || value.players.length !== playerCount) return false;
  const names = new Set();
  return value.players.every(player => {
    if (!player || typeof player.name !== 'string' || !player.name.trim()
      || typeof player.position !== 'string' || !player.position.trim()
      || !Number.isInteger(player.row) || player.row < 0 || player.row > 3) return false;
    const key = nameKey(player.name);
    if (names.has(key)) return false;
    names.add(key);
    return true;
  });
}

function customFormation(players) {
  const counts = [0, 0, 0, 0];
  players.forEach(player => { counts[player.row]++; });
  return `Personalizada (${counts.slice(1).join('-')}${counts[0] === 1 ? '' : `; ${counts[0]} no gol`})`;
}

/** Rows: 0 goalkeeper, 1 defence, 2 midfield, 3 attack. Sources describe the base lineup. */
export function mountMatchPitches(container, teams = [], options = {}) {
  const instance = ++matchPitchInstance;
  const wrapper = create('div', 'match-pitches');
  const people = Array.isArray(options.participants) ? options.participants.filter(person => person && typeof person.id === 'string') : [];
  const canEdit = people.length > 0 && typeof options.onSave === 'function';
  const edits = new Map();
  const history = new Map();
  const sections = [];
  let busy = false;
  let selectedId = people.some(person => person.id === options.selectedParticipantId)
    ? options.selectedParticipantId : people[0]?.id;

  const toolbar = create('div', 'match-pitches__toolbar');
  const participantLabel = create('label', 'match-pitches__control');
  participantLabel.append(create('span', '', 'Campinhos de quem?'));
  const participantSelect = create('select', 'match-pitches__select');
  people.forEach(person => {
    const option = create('option', '', person.name);
    option.value = person.id;
    participantSelect.append(option);
  });
  participantSelect.value = selectedId || '';
  participantSelect.disabled = !people.length;
  participantLabel.append(participantSelect);
  if (people.length) toolbar.append(participantLabel);
  toolbar.append(create('p', 'match-pitches__instructions', canEdit
    ? 'Toque em um jogador para substituir, editar ou mover. Cada participante tem seus próprios campinhos, salvos ao aplicar.'
    : 'Toque em um botão para ver o jogador e a posição.'));
  wrapper.append(toolbar);

  function selectedPerson() { return people.find(person => person.id === selectedId); }
  function stateKey(teamName) { return JSON.stringify([selectedId || '', teamName]); }

  function getLineup(team) {
    const key = stateKey(team.name);
    if (!edits.has(key)) {
      const saved = options.edits?.[selectedId]?.[team.name];
      const original = { players: clonePlayers(team.players || []), formation: team.formation || 'A confirmar' };
      edits.set(key, validEdit(saved, original.players.length)
        ? { players: clonePlayers(saved.players), formation: typeof saved.formation === 'string' ? saved.formation : customFormation(saved.players) }
        : original);
    }
    return edits.get(key);
  }

  function isPersonalized(team, lineup) {
    return JSON.stringify(lineup.players) !== JSON.stringify(clonePlayers(team.players || []));
  }

  function squadPool(team, lineup) {
    const pool = new Map();
    [...(team.players || []), ...(team.bench || [])].forEach(player => {
      if (player && typeof player.name === 'string') pool.set(nameKey(player.name), player);
    });
    const current = new Set(lineup.players.map(player => nameKey(player.name)));
    return [...pool.values()].filter(player => !current.has(nameKey(player.name)));
  }

  async function persist(team, candidate, feedback, mode = 'edit') {
    if (busy || !canEdit) return false;
    const key = stateKey(team.name);
    const participantId = selectedId;
    const previous = cloneLineup(getLineup(team));
    busy = true;
    participantSelect.disabled = true;
    wrapper.querySelectorAll('button').forEach(button => { button.disabled = true; });
    feedback.textContent = 'Salvando campinho…';
    try {
      const saved = await options.onSave(participantId, team.name, cloneLineup(candidate));
      if (saved === false) throw new Error('Persistence failed');
      if (!history.has(key)) history.set(key, []);
      const changes = history.get(key);
      if (mode === 'undo') changes.pop();
      else { changes.push(previous); if (changes.length > 20) changes.shift(); }
      edits.set(key, cloneLineup(candidate));
      renderSections({ teamName: team.name, message: mode === 'undo' ? 'Alteração desfeita e salva.' : 'Campinho salvo para ' + selectedPerson().name + '.' });
      return true;
    } catch {
      feedback.textContent = 'Não foi possível salvar. Suas alterações no formulário continuam disponíveis; tente aplicar novamente.';
      return false;
    } finally {
      busy = false;
      participantSelect.disabled = !people.length;
      wrapper.querySelectorAll('button').forEach(button => {
        button.disabled = button.dataset.unavailable === 'true';
      });
    }
  }

  function renderTeam(team, teamIndex, update) {
    const teamName = typeof team.name === 'string' ? team.name : 'Time';
    const lineup = getLineup(team);
    const personalized = isPersonalized(team, lineup);
    const section = create('section', `match-pitches__team${clubClass(teamName)}`);
    const heading = create('h3', 'match-pitches__heading', teamName);
    heading.id = `match-pitches-${instance}-${teamIndex}`;
    section.setAttribute('aria-labelledby', heading.id);
    const coach = create('p', 'match-pitches__meta');
    coach.append(create('strong', '', 'Treinador: '), document.createTextNode(team.coach || 'A confirmar'));
    const formation = create('p', 'match-pitches__meta');
    formation.append(create('strong', '', 'Formação: '), document.createTextNode(lineup.formation));
    const confirmed = team.confirmed === true || team.status === 'confirmed';
    const note = create('p', 'match-pitches__note', personalized
      ? `Escalação personalizada de ${selectedPerson()?.name || 'participante'}. A fonte abaixo se refere à escalação original.`
      : confirmed ? 'Escalação confirmada pela fonte indicada.'
        : 'Escalação provável. Os titulares podem mudar até a confirmação oficial.');
    const sources = create('p', 'match-pitches__sources');
    const link = sourceLink(team);
    if (link) sources.append(link); else sources.append(document.createTextNode('Fonte a confirmar.'));
    if (team.asOf) sources.append(document.createTextNode(` · Apurado em ${team.asOf}`));
    section.append(heading, coach, formation, note, sources);

    const feedback = create('p', 'match-pitches__status', update?.teamName === team.name
      ? update.message : canEdit ? 'Escolha um jogador no campo para editar.' : 'Toque em um botão para ver o jogador e a posição.');
    feedback.id = `match-pitches-status-${instance}-${teamIndex}`;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const editor = create('div', 'match-pitches__editor');
    editor.hidden = true;
    editor.id = `match-pitches-editor-${instance}-${teamIndex}`;

    if (canEdit) {
      const actions = create('div', 'match-pitches__team-actions');
      const restore = create('button', 'match-pitches__action', confirmed ? 'Restaurar escalação original' : 'Restaurar provável');
      restore.type = 'button';
      restore.addEventListener('click', () => {
        void persist(team, { players: clonePlayers(team.players || []), formation: team.formation || 'A confirmar' }, feedback);
      });
      const undo = create('button', 'match-pitches__action match-pitches__action--secondary', 'Desfazer alteração');
      undo.type = 'button';
      const changes = history.get(stateKey(team.name)) || [];
      undo.disabled = !changes.length;
      undo.dataset.unavailable = String(!changes.length);
      undo.addEventListener('click', () => {
        const latest = history.get(stateKey(team.name))?.at(-1);
        if (latest) void persist(team, cloneLineup(latest), feedback, 'undo');
      });
      actions.append(restore, undo);
      section.append(actions);
    }

    function openEditor(playerIndex) {
      if (busy || !canEdit) return;
      const player = lineup.players[playerIndex];
      editor.replaceChildren();
      editor.hidden = false;
      const title = create('h4', 'match-pitches__editor-heading', `Editar ${player.name}`);
      const form = create('form', 'match-pitches__editor-form');
      const chooseLabel = create('label', 'match-pitches__control');
      chooseLabel.append(create('span', '', 'Titular ou reserva'));
      const choose = create('select', 'match-pitches__select');
      const currentOption = create('option', '', `Manter ${player.name}`);
      currentOption.value = 'current';
      choose.append(currentOption);
      const available = squadPool(team, lineup).filter(person => person.available !== false);
      available.forEach((person, index) => {
        const option = create('option', '', `${person.name} · ${person.position || 'Posição a confirmar'}${person.status ? ` · ${person.status}` : ''}`);
        option.value = `reserve-${index}`;
        choose.append(option);
      });
      const customOption = create('option', '', 'Digitar outro jogador');
      customOption.value = 'custom';
      choose.append(customOption);
      chooseLabel.append(choose);

      const nameLabel = create('label', 'match-pitches__control');
      nameLabel.append(create('span', '', 'Nome do jogador'));
      const nameInput = create('input', 'match-pitches__input');
      nameInput.type = 'text'; nameInput.maxLength = 60; nameInput.required = true;
      nameInput.value = player.name;
      nameLabel.append(nameInput);
      const positionLabel = create('label', 'match-pitches__control');
      positionLabel.append(create('span', '', 'Posição'));
      const positionInput = create('input', 'match-pitches__input');
      positionInput.type = 'text'; positionInput.maxLength = 60; positionInput.required = true;
      positionInput.value = player.position;
      positionLabel.append(positionInput);
      const rowLabel = create('label', 'match-pitches__control');
      rowLabel.append(create('span', '', 'Setor do campo'));
      const rowSelect = create('select', 'match-pitches__select');
      ['Gol', 'Defesa', 'Meio-campo', 'Ataque'].forEach((label, row) => {
        const option = create('option', '', label); option.value = String(row); rowSelect.append(option);
      });
      rowSelect.value = String(player.row);
      rowLabel.append(rowSelect);
      const formStatus = create('p', 'match-pitches__editor-status');
      formStatus.setAttribute('role', 'status');
      formStatus.setAttribute('aria-live', 'polite');
      const formActions = create('div', 'match-pitches__team-actions');
      const apply = create('button', 'match-pitches__action', 'Aplicar no campinho'); apply.type = 'submit';
      const cancel = create('button', 'match-pitches__action match-pitches__action--secondary', 'Fechar'); cancel.type = 'button';
      cancel.addEventListener('click', () => { editor.hidden = true; });
      formActions.append(apply, cancel);
      form.append(chooseLabel, nameLabel, positionLabel, rowLabel, formStatus, formActions);

      choose.addEventListener('change', () => {
        if (choose.value === 'custom') { nameInput.focus(); return; }
        const replacement = choose.value === 'current' ? player : available[Number(choose.value.slice(8))];
        if (replacement) {
          nameInput.value = replacement.name;
          positionInput.value = replacement.position || player.position;
        }
      });
      nameInput.addEventListener('input', () => { choose.value = 'custom'; });
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (busy) return;
        const name = nameInput.value.trim().replace(/\s+/g, ' ');
        const position = positionInput.value.trim();
        if (!name || !position) { formStatus.textContent = 'Preencha o nome e a posição.'; return; }
        if (lineup.players.some((other, index) => index !== playerIndex && nameKey(other.name) === nameKey(name))) {
          formStatus.textContent = `${name} já está entre os titulares. Escolha outro jogador.`; return;
        }
        const next = clonePlayers(lineup.players);
        next[playerIndex] = { name, position, row: Number(rowSelect.value) };
        void persist(team, { players: next, formation: customFormation(next) }, formStatus);
      });

      const swapLabel = create('label', 'match-pitches__control');
      swapLabel.append(create('span', '', 'Trocar de posição com'));
      const swapSelect = create('select', 'match-pitches__select');
      lineup.players.forEach((other, index) => {
        if (index === playerIndex) return;
        const option = create('option', '', `${other.name} · ${other.position}`);
        option.value = String(index); swapSelect.append(option);
      });
      swapLabel.append(swapSelect);
      const swapButton = create('button', 'match-pitches__action match-pitches__action--secondary', 'Trocar posições');
      swapButton.type = 'button';
      swapButton.addEventListener('click', () => {
        if (busy || !swapSelect.value) return;
        const otherIndex = Number(swapSelect.value);
        const next = clonePlayers(lineup.players);
        const other = next[otherIndex];
        next[otherIndex] = { ...next[playerIndex], row: other.row };
        next[playerIndex] = { ...other, row: player.row };
        void persist(team, { players: next, formation: customFormation(next) }, formStatus);
      });
      const swapHelp = create('p', 'match-pitches__editor-help', 'A troca também altera a ordem dos botões quando os dois jogadores estão no mesmo setor.');
      editor.append(title, form, swapLabel, swapButton, swapHelp);
      choose.focus();
    }

    const field = create('div', 'match-pitches__field');
    field.setAttribute('role', 'group');
    field.setAttribute('aria-label', `Campo e posições de ${teamName}`);
    const groups = new Map([[3, { name: 'Ataque', players: [] }], [2, { name: 'Meio-campo', players: [] }], [1, { name: 'Defesa', players: [] }], [0, { name: 'Gol', players: [] }], [-1, { name: 'Posições a confirmar', players: [] }]]);
    lineup.players.forEach((player, index) => {
      const row = Number.isInteger(player.row) && player.row >= 0 && player.row <= 3 ? player.row : -1;
      groups.get(row).players.push({ ...player, index });
    });
    groups.forEach((group, rowIndex) => {
      if (!group.players.length) return;
      const row = create('div', `match-pitches__row match-pitches__row--${group.players.length}`);
      row.setAttribute('role', 'group'); row.setAttribute('aria-label', group.name);
      group.players.forEach(player => {
        const item = create('div', 'match-pitches__player');
        const button = create('button', 'match-pitches__button'); button.type = 'button';
        button.setAttribute('aria-label', `${player.name}, ${player.position}. ${canEdit ? 'Editar jogador' : 'Ver jogador'} de ${teamName}.`);
        button.setAttribute('aria-controls', canEdit ? editor.id : feedback.id);
        const disk = create('span', 'match-pitches__disk', initials(player.name)); disk.setAttribute('aria-hidden', 'true');
        button.append(disk, create('span', 'match-pitches__player-name', player.name), create('span', 'match-pitches__position', player.position));
        button.addEventListener('click', () => {
          feedback.textContent = `${teamName} — ${player.name}: ${player.position}.`;
          if (canEdit) openEditor(player.index);
        });
        item.append(button); row.append(item);
      });
      if (rowIndex === -1) row.classList.add('match-pitches__row--unknown');
      field.append(row);
    });
    if (!lineup.players.length) field.append(create('p', 'match-pitches__empty', 'Aguardando a escalação.'));
    section.append(field, feedback, editor);

    const pool = squadPool(team, lineup);
    const available = pool.filter(player => player.available !== false);
    const unavailable = pool.filter(player => player.available === false);
    const bench = create('details', 'match-pitches__bench');
    bench.append(create('summary', '', `Reservas disponíveis (${available.length})`));
    const benchList = create('ul', 'match-pitches__bench-list');
    available.forEach(player => { benchList.append(create('li', '', `${player.name} · ${player.position || 'Posição a confirmar'}${player.status ? ` · ${player.status}` : ''}`)); });
    if (available.length) bench.append(benchList);
    else bench.append(create('p', '', 'Nenhum reserva disponível cadastrado.'));
    if (unavailable.length) {
      bench.append(create('h4', '', 'Indisponíveis'));
      const unavailableList = create('ul', 'match-pitches__bench-list');
      unavailable.forEach(player => { unavailableList.append(create('li', '', `${player.name} · ${player.status || 'Indisponível'}`)); });
      bench.append(unavailableList);
    }
    section.append(bench);
    return section;
  }

  function renderSections(update) {
    sections.forEach(section => section.remove());
    sections.length = 0;
    teams.forEach((team, index) => {
      const section = renderTeam(team, index, update);
      sections.push(section); wrapper.append(section);
    });
  }

  participantSelect.addEventListener('change', () => {
    if (busy) return;
    selectedId = participantSelect.value;
    renderSections();
  });
  container.replaceChildren(wrapper);
  renderSections();
  return wrapper;
}
