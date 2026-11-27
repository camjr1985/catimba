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
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const link = create('a', 'match-pitches__source-link', team.sourceLabel || 'Consultar fonte');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  } catch {
    return null;
  }
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('pt-BR');
}

function clubClass(name) {
  const value = String(name).toLocaleLowerCase('pt-BR');
  if (value.includes('palmeiras')) return ' match-pitches__team--palmeiras';
  if (value.includes('estudiantes')) return ' match-pitches__team--estudiantes';
  return '';
}

/**
 * Display source-backed teams supplied by the parent app.
 * Rows: 0 goalkeeper, 1 defence, 2 midfield, 3 attack.
 * Lineups default to probable. Set confirmed: true or status: 'confirmed'
 * only when the source confirms the starting eleven.
 */
export function mountMatchPitches(container, teams = []) {
  const instance = ++matchPitchInstance;
  const wrapper = create('div', 'match-pitches');

  teams.forEach((team, teamIndex) => {
    const teamName = typeof team.name === 'string' ? team.name : 'Time';
    const section = create('section', `match-pitches__team${clubClass(teamName)}`);
    const heading = create('h3', 'match-pitches__heading', teamName);
    heading.id = `match-pitches-${instance}-${teamIndex}`;
    section.setAttribute('aria-labelledby', heading.id);
    const coach = create('p', 'match-pitches__meta');
    coach.append(create('strong', '', 'Treinador: '));
    coach.append(document.createTextNode(team.coach || 'A confirmar'));
    const formation = create('p', 'match-pitches__meta');
    formation.append(create('strong', '', 'Formação: '));
    formation.append(document.createTextNode(team.formation || 'A confirmar'));
    const confirmed = team.confirmed === true || team.status === 'confirmed';
    const note = create('p', 'match-pitches__note', confirmed
      ? 'Escalação confirmada pela fonte indicada.'
      : 'Escalação provável. Os titulares podem mudar até a confirmação oficial.');
    const sources = create('p', 'match-pitches__sources');
    const link = sourceLink(team);
    if (link) sources.append(link);
    else sources.append(document.createTextNode('Fonte a confirmar.'));
    if (team.asOf) sources.append(document.createTextNode(` · Apurado em ${team.asOf}`));
    section.append(heading, coach, formation, note, sources);

    const field = create('div', 'match-pitches__field');
    field.setAttribute('role', 'group');
    field.setAttribute('aria-label', `Campo e posições de ${teamName}`);
    const feedback = create('p', 'match-pitches__status', 'Toque em um botão para ver o jogador e a posição.');
    feedback.id = `match-pitches-status-${instance}-${teamIndex}`;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');

    const players = Array.isArray(team.players) ? team.players : [];
    const groups = new Map([
      [3, { name: 'Ataque', players: [] }],
      [2, { name: 'Meio-campo', players: [] }],
      [1, { name: 'Defesa', players: [] }],
      [0, { name: 'Gol', players: [] }],
      [-1, { name: 'Posições a confirmar', players: [] }]
    ]);
    players.forEach(player => {
      const row = Number.isInteger(player.row) && player.row >= 0 && player.row <= 3
        ? player.row : -1;
      groups.get(row).players.push(player);
    });

    groups.forEach((group, rowIndex) => {
      if (!group.players.length) return;
      const row = create('div', `match-pitches__row match-pitches__row--${group.players.length}`);
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', group.name);
      group.players.forEach(player => {
        const name = typeof player.name === 'string' ? player.name : 'A confirmar';
        const position = typeof player.position === 'string' ? player.position : 'Posição a confirmar';
        const item = create('div', 'match-pitches__player');
        const button = create('button', 'match-pitches__button');
        button.type = 'button';
        button.setAttribute('aria-label', `${name}, ${position}. Ver jogador de ${teamName}.`);
        button.setAttribute('aria-controls', feedback.id);
        const disk = create('span', 'match-pitches__disk', initials(name));
        disk.setAttribute('aria-hidden', 'true');
        button.append(disk);
        button.addEventListener('click', () => {
          feedback.textContent = `${teamName} — ${name}: ${position}.`;
        });
        item.append(button,
          create('span', 'match-pitches__player-name', name),
          create('span', 'match-pitches__position', position));
        row.append(item);
      });
      if (rowIndex === -1) row.classList.add('match-pitches__row--unknown');
      field.append(row);
    });
    if (!players.length) field.append(create('p', 'match-pitches__empty', 'Aguardando a escalação.'));
    section.append(field, feedback);
    wrapper.append(section);
  });

  container.replaceChildren(wrapper);
  return wrapper;
}
