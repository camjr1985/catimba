let pitchInstance = 0;

const positions = [
  'Goleiro',
  'Lateral esquerdo',
  'Zagueiro esquerdo',
  'Zagueiro direito',
  'Lateral direito',
  'Meia esquerdo',
  'Meia central',
  'Meia direito',
  'Ponta esquerda',
  'Centroavante',
  'Ponta direita'
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizeLineup(value, participant) {
  return {
    teamName: typeof value?.teamName === 'string'
      ? value.teamName.slice(0, 60)
      : `Time de ${participant.name}`,
    players: Array.from({ length: 11 }, (_, index) =>
      typeof value?.players?.[index] === 'string'
        ? value.players[index].slice(0, 40)
        : '')
  };
}

/** Render a participant's editable 4-3-3. Persistence belongs to onSave. */
export function mountPitch(container, { participants = [], lineups = {}, onSave } = {}) {
  const people = participants.filter(person => person && typeof person.id === 'string');
  const drafts = new Map();
  let saveAttempt = 0;
  const instance = ++pitchInstance;
  const details = element('details', 'catimba-pitch');
  const summary = element('summary', 'catimba-pitch__summary', 'Nossos campinhos');
  const body = element('div', 'catimba-pitch__body');
  const intro = element('p', 'catimba-pitch__intro', 'Escolha o participante e monte o seu time no 4-3-3. As alterações são salvas automaticamente.');
  const form = element('form', 'catimba-pitch__form');
  const controls = element('div', 'catimba-pitch__controls');
  const participantLabel = element('label', 'catimba-pitch__control');
  participantLabel.append(element('span', '', 'Participante'));
  const selector = element('select', 'catimba-pitch__select');
  selector.name = `pitch-participant-${instance}`;
  people.forEach(person => {
    const option = element('option', '', person.name);
    option.value = person.id;
    selector.append(option);
  });
  participantLabel.append(selector);

  const teamLabel = element('label', 'catimba-pitch__control');
  teamLabel.append(element('span', '', 'Nome do time'));
  const teamInput = element('input', 'catimba-pitch__team-input');
  teamInput.type = 'text';
  teamInput.name = `pitch-team-${instance}`;
  teamInput.maxLength = 60;
  teamInput.placeholder = 'Dê um nome ao seu time';
  teamLabel.append(teamInput);
  controls.append(participantLabel, teamLabel);

  const field = element('div', 'catimba-pitch__field');
  field.setAttribute('role', 'group');
  field.setAttribute('aria-label', 'Escalação no campo, formação 4-3-3');
  const inputs = new Array(11);
  [
    { name: 'Ataque', indices: [8, 9, 10] },
    { name: 'Meio-campo', indices: [5, 6, 7] },
    { name: 'Defesa', indices: [1, 2, 3, 4] },
    { name: 'Gol', indices: [0] }
  ].forEach(({ name, indices }) => {
    const row = element('div', `catimba-pitch__row catimba-pitch__row--${indices.length}`);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', name);
    indices.forEach(index => {
      const label = element('label', 'catimba-pitch__player');
      label.append(element('span', 'catimba-pitch__position', positions[index]));
      const input = element('input', 'catimba-pitch__player-input');
      input.type = 'text';
      input.name = `pitch-player-${instance}-${index}`;
      input.maxLength = 40;
      input.placeholder = 'Nome';
      input.autocomplete = 'off';
      label.append(input);
      inputs[index] = input;
      row.append(label);
    });
    field.append(row);
  });

  const actions = element('div', 'catimba-pitch__actions');
  const save = element('button', 'catimba-pitch__save', 'Salvar escalação');
  save.type = 'submit';
  const status = element('p', 'catimba-pitch__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  actions.append(save, status);
  form.append(controls, field, actions);
  body.append(intro, form);
  details.append(summary, body);
  container.replaceChildren(details);

  function selectedPerson() {
    return people.find(person => person.id === selector.value);
  }

  function currentDraft() {
    const person = selectedPerson();
    if (!person) return null;
    if (!drafts.has(person.id)) {
      drafts.set(person.id, normalizeLineup(lineups[person.id], person));
    }
    return drafts.get(person.id);
  }

  function render() {
    saveAttempt++;
    const draft = currentDraft();
    const disabled = !draft;
    selector.disabled = people.length === 0;
    teamInput.disabled = disabled;
    save.disabled = disabled;
    teamInput.value = draft?.teamName ?? '';
    inputs.forEach((input, index) => {
      input.disabled = disabled;
      input.value = draft?.players[index] ?? '';
    });
    status.textContent = disabled ? 'Adicione um participante para montar um time.' : '';
  }

  function rememberEdits() {
    const draft = currentDraft();
    if (!draft) return;
    draft.teamName = teamInput.value;
    draft.players = inputs.map(input => input.value);
    void persistDraft(false);
  }

  async function persistDraft(explicitSave) {
    const person = selectedPerson();
    const draft = currentDraft();
    if (!person || !draft) return;
    const attempt = ++saveAttempt;
    const isCurrent = () => attempt === saveAttempt && selector.value === person.id;
    const lineup = {
      teamName: explicitSave
        ? draft.teamName.trim() || `Time de ${person.name}`
        : draft.teamName,
      players: draft.players.map(name => explicitSave ? name.trim() : name)
    };
    if (explicitSave) save.disabled = true;
    status.textContent = 'Salvando escalação…';
    try {
      if (typeof onSave !== 'function') throw new Error('Missing persistence callback');
      const saved = await onSave(person.id, lineup);
      if (saved === false) throw new Error('Persistence failed');
      if (!isCurrent()) return;
      if (explicitSave) {
        drafts.set(person.id, { teamName: lineup.teamName, players: [...lineup.players] });
        teamInput.value = lineup.teamName;
        inputs.forEach((input, index) => { input.value = lineup.players[index]; });
      }
      status.textContent = explicitSave
        ? `Escalação de ${person.name} salva.`
        : `Escalação de ${person.name} salva automaticamente.`;
    } catch {
      if (isCurrent()) status.textContent = 'Não foi possível salvar. Tente novamente.';
    } finally {
      if (explicitSave) save.disabled = !selectedPerson();
    }
  }

  selector.addEventListener('change', render);
  teamInput.addEventListener('input', rememberEdits);
  inputs.forEach(input => input.addEventListener('input', rememberEdits));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (save.disabled) return;
    void persistDraft(true);
  });

  render();
  return details;
}
