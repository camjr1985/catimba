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

function clubClass(name) {
  const value = nameKey(name);
  if (value.includes('palmeiras')) return ' match-pitches__team--palmeiras';
  if (value.includes('estudiantes')) return ' match-pitches__team--estudiantes';
  return '';
}

function clonePlayers(players) {
  return players.map(player => ({ name: player.name, position: player.position, row: player.row,
    ...(Number.isFinite(player.x) && Number.isFinite(player.y) ? { x: player.x, y: player.y } : {}) }));
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
    if ((player.x !== undefined || player.y !== undefined)
      && (!Number.isFinite(player.x) || !Number.isFinite(player.y)
        || player.x < 0 || player.x > 100 || player.y < 0 || player.y > 100)) return false;
    const key = nameKey(player.name);
    if (names.has(key)) return false;
    names.add(key);
    return true;
  });
}

function customFormation(players) {
  if (players.some(player => Number.isFinite(player.x) && Number.isFinite(player.y))) return 'Personalizada (posições livres)';
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
  let busy = false;
  let expandedView = false;
  let suppressPlayerClickUntil = 0;
  let boardMessage = '';
  let closeExpandedView = async () => {};
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
    ? 'Segure e arraste um jogador para mover no campo; a posição é salva ao soltar. Clique ou toque sem arrastar para substituir e editar. Cada participante tem seus próprios campinhos.'
    : 'Toque em um botão para ver o jogador e a posição.'));
  const board = create('div', 'match-pitches__board');
  const panels = create('div', 'match-pitches__panels');
  wrapper.append(toolbar, board, panels);
  wrapper.addEventListener('click', event => {
    if (event.detail !== 0 && performance.now() < suppressPlayerClickUntil
      && event.target.closest('.match-pitches__button')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);

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
    if (mode === 'drag') board.querySelector('.match-pitches__graphic-tools-status').textContent = 'Salvando posição…';
    try {
      const saved = await options.onSave(participantId, team.name, cloneLineup(candidate));
      if (saved === false) throw new Error('Persistence failed');
      if (!history.has(key)) history.set(key, []);
      const changes = history.get(key);
      if (mode === 'undo') changes.pop();
      else { changes.push(previous); if (changes.length > 20) changes.shift(); }
      edits.set(key, cloneLineup(candidate));
      boardMessage = mode === 'drag' ? 'Posição salva para ' + selectedPerson().name + '.' : '';
      renderSections({ teamName: team.name, message: mode === 'undo' ? 'Alteração desfeita e salva.' : 'Campinho salvo para ' + selectedPerson().name + '.' });
      return true;
    } catch {
      feedback.textContent = mode === 'drag'
        ? 'Não foi possível salvar a posição. Arraste novamente para tentar salvar.'
        : 'Não foi possível salvar. Suas alterações no formulário continuam disponíveis; tente aplicar novamente.';
      if (mode === 'drag') {
        boardMessage = feedback.textContent;
        edits.set(key, cloneLineup(candidate));
        renderSections({ teamName: team.name, message: boardMessage });
      }
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
        const row = Number(rowSelect.value);
        next[playerIndex] = { ...next[playerIndex], name, position, row };
        if (row !== player.row) { delete next[playerIndex].x; delete next[playerIndex].y; }
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
        const playerPlace = visualPosition(teamIndex, playerIndex, lineup);
        const otherPlace = visualPosition(teamIndex, otherIndex, lineup);
        next[otherIndex] = { ...next[playerIndex], row: other.row, ...otherPlace };
        next[playerIndex] = { ...other, row: player.row, ...playerPlace };
        void persist(team, { players: next, formation: customFormation(next) }, formStatus);
      });
      const swapHelp = create('p', 'match-pitches__editor-help', 'A troca também altera a ordem dos botões quando os dois jogadores estão no mesmo setor.');
      editor.append(title, form, swapLabel, swapButton, swapHelp);
      choose.focus();
    }

    const field = create('div', `match-pitches__half match-pitches__half--${teamIndex % 2 === 0 ? 'left' : 'right'}${clubClass(teamName)}`);
    field.setAttribute('role', 'group');
    field.setAttribute('aria-label', `Campo e posições de ${teamName}`);
    const groups = new Map([[3, { name: 'Ataque', players: [] }], [2, { name: 'Meio-campo', players: [] }], [1, { name: 'Defesa', players: [] }], [0, { name: 'Gol', players: [] }], [-1, { name: 'Posições a confirmar', players: [] }]]);
    lineup.players.forEach((player, index) => {
      const row = Number.isInteger(player.row) && player.row >= 0 && player.row <= 3 ? player.row : -1;
      groups.get(row).players.push({ ...player, index });
    });
    groups.forEach((group, rowIndex) => {
      if (!group.players.length) return;
      group.players.forEach(player => {
        const item = create('div', 'match-pitches__player match-pitches__player--free');
        item.dataset.teamIndex = String(teamIndex);
        item.dataset.playerIndex = String(player.index);
        const place = defaultPosition(teamIndex, player.index, lineup);
        placePlayer(item, place.x, place.y);
        const button = create('button', 'match-pitches__button'); button.type = 'button';
        button.setAttribute('aria-label', `${player.name}, ${player.position}. ${canEdit ? 'Editar jogador' : 'Ver jogador'} de ${teamName}.`);
        button.setAttribute('aria-controls', canEdit ? editor.id : feedback.id);
        const disk = create('span', `match-pitches__disk${rowIndex === 0 ? ' match-pitches__disk--goalkeeper' : ''}`); disk.setAttribute('aria-hidden', 'true');
        button.append(disk, create('span', 'match-pitches__player-name', player.name), create('span', 'match-pitches__position', player.position));
        button.addEventListener('click', async () => {
          feedback.textContent = `${teamName} — ${player.name}: ${player.position}.`;
          if (canEdit) {
            await closeExpandedView();
            openEditor(player.index);
          }
        });
        if (canEdit) enableDrag(button, item, team, teamIndex, player.index, lineup, feedback);
        item.append(button); field.append(item);
      });
    });
    if (!lineup.players.length) field.append(create('p', 'match-pitches__empty', 'Aguardando a escalação.'));
    section.append(feedback, editor);

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
    return { section, field, lineup, team };
  }

  function defaultPosition(teamIndex, playerIndex, lineup) {
    const player = lineup.players[playerIndex];
    if (Number.isFinite(player.x) && Number.isFinite(player.y)) return { x: player.x, y: player.y };
    const peers = lineup.players.map((person, index) => ({ person, index })).filter(({person}) => person.row === player.row);
    const order = peers.findIndex(({index}) => index === playerIndex);
    const distance = ([9,31,53,73][player.row] ?? 53) / 2;
    return { x: teamIndex % 2 === 0 ? distance : 100 - distance, y: 4 + 92 * (order + .5) / peers.length };
  }

  function placePlayer(item, x, y) {
    item.style.setProperty('--player-x', `${x}%`);
    item.style.setProperty('--player-y', `${y}%`);
  }

  function fieldPosition(item) {
    const pitch = item.closest('.match-pitches__field');
    const bounds = pitch.getBoundingClientRect(), box = item.getBoundingClientRect();
    return { x: 100 * (box.left + box.width / 2 - bounds.left - pitch.clientLeft) / pitch.clientWidth,
      y: 100 * (box.top + box.height / 2 - bounds.top - pitch.clientTop) / pitch.clientHeight };
  }

  function visualPosition(teamIndex, playerIndex, lineup) {
    const item = board.querySelector(`[data-team-index="${teamIndex}"][data-player-index="${playerIndex}"]`);
    return item ? fieldPosition(item) : defaultPosition(teamIndex, playerIndex, lineup);
  }

  function enableDrag(button, item, team, teamIndex, playerIndex, lineup, feedback) {
    let drag = null;
    button.draggable = false;
    button.addEventListener('dragstart', event => event.preventDefault());
    button.addEventListener('pointerdown', event => {
      if (busy || drag || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const pitch = item.closest('.match-pitches__field');
      const box = item.getBoundingClientRect();
      drag = { pointerId: event.pointerId, pitch, startX: event.clientX, startY: event.clientY,
        participantId: selectedId,
        centerX: box.left + box.width / 2, centerY: box.top + box.height / 2,
        originalX: item.style.getPropertyValue('--player-x'), originalY: item.style.getPropertyValue('--player-y'),
        moved: false, next: null };
      try { button.setPointerCapture(event.pointerId); } catch { drag = null; }
    });
    button.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
      drag.moved = true;
      event.preventDefault();
      item.classList.add('match-pitches__player--dragging');
      item.parentElement.classList.add('match-pitches__half--dragging');
      wrapper.classList.add('match-pitches--dragging');
      const bounds = drag.pitch.getBoundingClientRect(), box = item.getBoundingClientRect();
      const width = drag.pitch.clientWidth, height = drag.pitch.clientHeight;
      const left = bounds.left + drag.pitch.clientLeft, top = bounds.top + drag.pitch.clientTop;
      const x = Math.max(box.width / 2, Math.min(width - box.width / 2, drag.centerX + event.clientX - drag.startX - left));
      const y = Math.max(box.height / 2, Math.min(height - box.height / 2, drag.centerY + event.clientY - drag.startY - top));
      drag.next = { x: Number((100 * x / width).toFixed(4)), y: Number((100 * y / height).toFixed(4)) };
      placePlayer(item, drag.next.x, drag.next.y);
    });
    const finish = (event, cancelled) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const finished = drag; drag = null;
      item.classList.remove('match-pitches__player--dragging');
      item.parentElement.classList.remove('match-pitches__half--dragging');
      wrapper.classList.remove('match-pitches--dragging');
      try { if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId); } catch {}
      if (!finished.moved) return;
      suppressPlayerClickUntil = performance.now() + 450;
      if (cancelled || selectedId !== finished.participantId || !finished.next) {
        item.style.setProperty('--player-x', finished.originalX);
        item.style.setProperty('--player-y', finished.originalY);
        return;
      }
      const next = clonePlayers(lineup.players);
      next[playerIndex] = { ...next[playerIndex], ...finished.next };
      void persist(team, { players: next, formation: customFormation(next) }, feedback, 'drag');
    };
    button.addEventListener('pointerup', event => finish(event, false));
    button.addEventListener('pointercancel', event => finish(event, true));
    button.addEventListener('lostpointercapture', event => finish(event, true));
  }

  function renderBoard(rendered) {
    const graphic = create('div', 'match-pitches__graphic');
    const tools = create('div', 'match-pitches__graphic-tools');
    const title = create('p', 'match-pitches__graphic-title', teams.map(team => team.name).join(' × '));
    const fullscreen = create('button', 'match-pitches__action match-pitches__action--secondary', 'Ampliar campinho');
    fullscreen.type = 'button';
    closeExpandedView = async () => {
      expandedView = false;
      if (document.fullscreenElement === graphic) {
        try { await document.exitFullscreen(); } catch {}
      }
      graphic.classList.remove('match-pitches__graphic--expanded');
      graphic.removeAttribute('role');
      graphic.removeAttribute('aria-modal');
      graphic.removeAttribute('aria-label');
      fullscreen.textContent = 'Ampliar campinho';
    };
    const expandOverlay = () => {
      expandedView = true;
      graphic.classList.add('match-pitches__graphic--expanded');
      graphic.setAttribute('role', 'dialog');
      graphic.setAttribute('aria-modal', 'true');
      graphic.setAttribute('aria-label', 'Campinho ampliado');
      fullscreen.textContent = 'Fechar ampliação';
      fullscreen.focus();
    };
    fullscreen.addEventListener('click', async () => {
      if (document.fullscreenElement === graphic || graphic.classList.contains('match-pitches__graphic--expanded')) {
        await closeExpandedView();
        fullscreen.focus();
        return;
      }
      try {
        if (typeof graphic.requestFullscreen !== 'function') { expandOverlay(); return; }
        await graphic.requestFullscreen();
        if (document.fullscreenElement === graphic) { expandedView = true; fullscreen.textContent = 'Fechar ampliação'; }
        else expandOverlay();
      } catch { expandOverlay(); }
    });
    graphic.addEventListener('fullscreenchange', () => {
      if (!graphic.isConnected) return;
      expandedView = document.fullscreenElement === graphic || graphic.classList.contains('match-pitches__graphic--expanded');
      fullscreen.textContent = document.fullscreenElement === graphic || graphic.classList.contains('match-pitches__graphic--expanded') ? 'Fechar ampliação' : 'Ampliar campinho';
    });
    graphic.addEventListener('keydown', async event => {
      if (!graphic.classList.contains('match-pitches__graphic--expanded')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        await closeExpandedView();
        fullscreen.focus();
      } else if (event.key === 'Tab') {
        const focusable = [...graphic.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    const toolsStatus = create('span', 'match-pitches__graphic-tools-status');
    toolsStatus.setAttribute('role', 'status');
    toolsStatus.textContent = boardMessage;
    tools.append(title, fullscreen, toolsStatus);
    const scroll = create('div', 'match-pitches__scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Campinho horizontal. Role para os lados para ver os dois times.');
    const canvas = create('div', 'match-pitches__canvas');
    const banner = create('div', 'match-pitches__banner');
    const teamHeader = (item, side) => {
      const header = create('div', `match-pitches__club-header match-pitches__club-header--${side}`);
      header.append(create('strong', 'match-pitches__club-name', item?.team.name || 'Time a confirmar'));
      if (item) header.append(create('span', 'match-pitches__club-coach', `${item.lineup.formation} · Téc. ${item.team.coach || 'A confirmar'}`));
      return header;
    };
    const meta = create('div', 'match-pitches__match-meta');
    const personalized = rendered.some(item => isPersonalized(item.team, item.lineup));
    meta.append(create('strong', 'match-pitches__badge', personalized ? 'NOSSAS ESCALAÇÕES' : 'ESCALAÇÕES PROVÁVEIS'));
    meta.append(create('span', 'match-pitches__versus', '×'));
    meta.append(create('span', 'match-pitches__competition', options.competitionLabel || 'FUTEBOL DE BOTÃO · CATIMBA'));
    if (options.kickoffLabel) meta.append(create('span', 'match-pitches__kickoff', options.kickoffLabel));
    const owner = create('span', 'match-pitches__owner', selectedPerson()?.name || '\u00a0');
    owner.title = selectedPerson()?.name || '';
    meta.append(owner);
    banner.append(teamHeader(rendered[0], 'left'), meta, teamHeader(rendered[1], 'right'));
    const field = create('div', 'match-pitches__field');
    field.setAttribute('role', 'group');
    field.setAttribute('aria-label', `Campo de ${teams.map(team => team.name).join(' contra ')}`);
    let largestLine = 1;
    rendered.forEach(item => {
      for (let row = 0; row < 4; row++) largestLine = Math.max(largestLine, item.lineup.players.filter(player => player.row === row).length);
    });
    field.style.setProperty('--pitch-height', `${Math.max(460, largestLine * 94 + 30)}px`);
    for (const side of ['left', 'right']) {
      field.append(create('div', `match-pitches__penalty match-pitches__penalty--${side}`), create('div', `match-pitches__six-yard match-pitches__six-yard--${side}`), create('div', `match-pitches__goal match-pitches__goal--${side}`));
    }
    const mark = create('div', 'match-pitches__center-brand');
    mark.setAttribute('aria-label', 'Catimba do Carlinhos e Tiba');
    mark.append(create('span', 'match-pitches__brand-overline', 'O PROGRAMA'), create('strong', 'match-pitches__brand-name', 'CATIMBA'), create('span', 'match-pitches__brand-tagline', 'do Carlinhos e Tiba'));
    field.append(mark, ...rendered.map(item => item.field));
    canvas.append(banner, field);
    scroll.append(canvas);
    graphic.append(tools, scroll);
    board.replaceChildren(graphic);
    graphic.querySelectorAll('.match-pitches__player').forEach(item => {
      requestAnimationFrame(() => { if (item.isConnected) item.style.setProperty('--player-half-height', `${item.offsetHeight / 2}px`); });
    });
    if (expandedView) expandOverlay();
  }

  function renderSections(update) {
    const rendered = teams.map((team, index) => renderTeam(team, index, update));
    panels.replaceChildren(...rendered.map(item => item.section));
    renderBoard(rendered);
  }

  participantSelect.addEventListener('change', () => {
    if (busy) return;
    selectedId = participantSelect.value;
    boardMessage = '';
    wrapper.classList.remove('match-pitches--dragging');
    renderSections();
  });
  container.replaceChildren(wrapper);
  renderSections();
  return wrapper;
}
