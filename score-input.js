let scoreInputSequence = 0;

const validText = value => /^[0-9]{0,2}$/.test(value);
const scoreValue = value => value === '' ? null : Number(value);
const validValue = value => value === null
  || (Number.isInteger(value) && value >= 0 && value <= 99);

/**
 * A score can be blank or an integer from 0 to 99. Invalid edits keep the last
 * valid text, rather than coercing pasted decimals or scientific notation.
 * onValue runs immediately for a changed numeric value; onCommit runs on blur
 * or Enter, once per edit revision in each focus visit. Enter then calls onNext.
 * setValue mirrors app state without firing callbacks or moving an active caret
 * when that field already represents the same value. cancel removes listeners.
 */
export function enhanceScoreInput(input, { onValue, onCommit, onNext } = {}) {
  const document = input.ownerDocument;
  const errorId = `catimba-score-error-${++scoreInputSequence}`;
  const previousInvalid = input.getAttribute('aria-invalid');
  const error = document.createElement('span');
  error.id = errorId;
  error.className = 'score-input-error';
  error.hidden = true;
  error.setAttribute('role', 'status');
  error.setAttribute('aria-live', 'polite');

  input.type = 'text';
  input.inputMode = 'numeric';
  input.maxLength = 2;
  input.pattern = '[0-9]{1,2}';
  input.autocomplete = 'off';
  input.enterKeyHint = 'next';
  input.classList.add('catimba-score-input');
  input.setCustomValidity('');
  input.setAttribute('aria-invalid', 'false');
  const descriptions = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  descriptions.add(errorId);
  input.setAttribute('aria-describedby', [...descriptions].join(' '));

  let lastText = validText(input.value) ? input.value : '';
  if (input.value !== lastText) input.value = lastText;
  let lastValue = scoreValue(lastText);
  let revision = 0, committedRevision = -1;
  let composing = false, pendingBlur = false, cancelled = false;
  let selectOnPointerRelease = false;
  const listeners = [];

  function selection() {
    return {
      start: input.selectionStart,
      end: input.selectionEnd,
      direction: input.selectionDirection || 'none'
    };
  }
  let beforeSelection = selection();

  function mountError() {
    if (!error.parentNode && input.parentNode) input.insertAdjacentElement('afterend', error);
  }

  function clearError() {
    error.textContent = '';
    error.hidden = true;
    input.setCustomValidity('');
    input.setAttribute('aria-invalid', 'false');
  }

  function reject() {
    mountError();
    error.textContent = 'Use um número inteiro de 0 a 99.';
    error.hidden = false;
    // The rejected edit is not the field's current value, so it stays valid.
    input.setAttribute('aria-invalid', 'false');
  }

  function restore() {
    input.value = lastText;
    if (typeof beforeSelection.start === 'number' && typeof beforeSelection.end === 'number') {
      input.setSelectionRange(Math.min(beforeSelection.start, lastText.length),
        Math.min(beforeSelection.end, lastText.length), beforeSelection.direction);
    }
    reject();
  }

  function acceptCurrent() {
    if (composing || cancelled) return;
    if (!validText(input.value)) { restore(); return; }
    const text = input.value, value = scoreValue(text);
    if (text !== lastText) revision++;
    lastText = text;
    beforeSelection = selection();
    clearError();
    if (value !== lastValue) {
      lastValue = value;
      if (typeof onValue === 'function') onValue(value);
    }
  }

  function commit(reason) {
    if (cancelled || composing) return;
    acceptCurrent();
    if (committedRevision === revision) return;
    committedRevision = revision;
    if (typeof onCommit === 'function') onCommit(lastValue, { reason });
  }

  function proposedText(text) {
    const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    return input.value.slice(0, start) + text + input.value.slice(end);
  }

  function listen(type, listener) {
    input.addEventListener(type, listener);
    listeners.push([type, listener]);
  }

  listen('focus', () => {
    mountError();
    // A fresh visit can finish another field's deferred preview refresh even if
    // this score is unchanged. Only Enter followed by blur in this visit merges.
    committedRevision = -1;
    if (!composing) input.select();
    beforeSelection = selection();
  });
  listen('pointerdown', () => {
    selectOnPointerRelease = document.activeElement !== input;
  });
  listen('pointerup', () => {
    if (selectOnPointerRelease && !composing) input.select();
    beforeSelection = selection();
  });
  listen('mouseup', event => {
    if (selectOnPointerRelease && !composing) {
      event.preventDefault();
      input.select();
    }
    selectOnPointerRelease = false;
    beforeSelection = selection();
  });
  listen('pointercancel', () => { selectOnPointerRelease = false; });
  listen('beforeinput', event => {
    if (composing || event.isComposing) return;
    beforeSelection = selection();
    if (event.cancelable && typeof event.data === 'string'
      && String(event.inputType || '').startsWith('insert')
      && !validText(proposedText(event.data))) {
      event.preventDefault();
      reject();
    }
  });
  listen('paste', event => {
    if (composing || !event.clipboardData) return;
    beforeSelection = selection();
    const text = event.clipboardData.getData('text');
    if (!validText(proposedText(text))) {
      // Inspect the whole clipboard before maxlength can silently truncate it.
      event.preventDefault();
      reject();
    }
  });
  listen('input', event => {
    if (!event.isComposing) acceptCurrent();
  });
  listen('compositionstart', () => {
    composing = true;
    beforeSelection = selection();
  });
  listen('compositionend', () => {
    composing = false;
    acceptCurrent();
    if (pendingBlur) { pendingBlur = false; commit('blur'); }
  });
  listen('keydown', event => {
    if (event.key !== 'Enter' || composing || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    commit('enter');
    if (!cancelled && input.isConnected !== false && typeof onNext === 'function') onNext(input);
  });
  listen('blur', () => {
    selectOnPointerRelease = false;
    if (composing) pendingBlur = true;
    else commit('blur');
  });

  mountError();
  return {
    setValue(value) {
      if (cancelled || composing || !validValue(value)) return false;
      const sameActiveValue = document.activeElement === input && validText(input.value)
        && scoreValue(input.value) === value;
      const text = sameActiveValue ? input.value : value === null ? '' : String(value);
      if (input.value !== text) input.value = text;
      if (lastText !== text) revision++;
      lastText = text;
      lastValue = value;
      beforeSelection = selection();
      clearError();
      mountError();
      return true;
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      listeners.forEach(([type, listener]) => input.removeEventListener(type, listener));
      error.remove();
      const descriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/)
        .filter(id => id && id !== errorId);
      if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));
      else input.removeAttribute('aria-describedby');
      if (previousInvalid === null) input.removeAttribute('aria-invalid');
      else input.setAttribute('aria-invalid', previousInvalid);
    }
  };
}
