const DEFAULT_RESULTS_INTERVAL = 60_000;
const DEFAULT_STANDINGS_INTERVAL = 180_000;

function interval(value, fallback) {
  return Number.isFinite(value) && value >= 1 && value <= 2_147_483_647
    ? Math.floor(value) : fallback;
}

/**
 * Refresh the visible Catimba page without overlapping automatic cycles.
 * Starts immediately with results and standings. Results bypass their cache;
 * standings run when their interval expires. Hidden/offline pages pause, then
 * catch up when visible/online. refresh() queues both; stop() removes timers
 * and listeners (requests already started are allowed to settle).
 *
 * The callback owns source errors and UI feedback. A rejected callback never
 * stops subsequent cycles or prevents the other independent request.
 */
export function startAutoRefresh({
  refreshResults,
  refreshStandings,
  document = globalThis.document,
  window = globalThis.window,
  resultInterval = DEFAULT_RESULTS_INTERVAL,
  standingsInterval = DEFAULT_STANDINGS_INTERVAL
} = {}) {
  if (typeof refreshResults !== 'function' || typeof refreshStandings !== 'function') {
    throw new TypeError('Automatic updates require results and standings callbacks.');
  }
  const resultsDelay = interval(resultInterval, DEFAULT_RESULTS_INTERVAL);
  const standingsDelay = interval(standingsInterval, DEFAULT_STANDINGS_INTERVAL);
  const timerHost = typeof window?.setTimeout === 'function' ? window : globalThis;
  const setTimer = timerHost.setTimeout.bind(timerHost);
  const clearTimer = timerHost.clearTimeout.bind(timerHost);
  let timer = null, stopped = false, running = false;
  let pending = false, pendingStandings = false;
  let lastResultsAttempt = null, lastStandingsAttempt = null;
  let runPromise = Promise.resolve();

  const paused = () => stopped || document?.hidden === true || window?.navigator?.onLine === false;

  function clearScheduled() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function schedule() {
    clearScheduled();
    if (paused()) return;
    const elapsed = lastResultsAttempt === null ? 0 : Date.now() - lastResultsAttempt;
    const delay = elapsed >= 0 ? Math.max(1, resultsDelay - elapsed) : resultsDelay;
    timer = setTimer(() => {
      timer = null;
      void request(false);
    }, delay);
    // Browser timers are numbers. A Node import should not keep a process alive.
    if (typeof timer?.unref === 'function') timer.unref();
  }

  async function processQueue() {
    running = true;
    try {
      while (pending && !paused()) {
        const forceStandings = pendingStandings;
        pending = false;
        pendingStandings = false;
        const now = Date.now();
        lastResultsAttempt = now;
        const standingsDue = forceStandings || lastStandingsAttempt === null
          || now < lastStandingsAttempt || now - lastStandingsAttempt >= standingsDelay;
        const requests = [Promise.resolve().then(() => refreshResults({ force: true }))];
        if (standingsDue) {
          lastStandingsAttempt = now;
          requests.push(Promise.resolve().then(() => refreshStandings()));
        }
        const settled = await Promise.allSettled(requests);
        if (standingsDue && settled[1].status === 'rejected') lastStandingsAttempt = null;
      }
    } finally {
      running = false;
      schedule();
    }
  }

  function request(forceStandings) {
    if (stopped) return Promise.resolve();
    clearScheduled();
    pending = true;
    pendingStandings ||= forceStandings;
    if (!running && !paused()) runPromise = processQueue();
    return runPromise;
  }

  function visibilityChanged() {
    if (paused()) clearScheduled();
    else void request(false);
  }
  function online() { if (!paused()) void request(false); }
  function offline() { clearScheduled(); }

  document?.addEventListener?.('visibilitychange', visibilityChanged);
  window?.addEventListener?.('online', online);
  window?.addEventListener?.('offline', offline);
  void request(false);

  return {
    /** Request both sources; concurrent calls collapse into one queued cycle. */
    refresh() { return request(true); },
    stop() {
      if (stopped) return;
      stopped = true;
      pending = false;
      pendingStandings = false;
      clearScheduled();
      document?.removeEventListener?.('visibilitychange', visibilityChanged);
      window?.removeEventListener?.('online', online);
      window?.removeEventListener?.('offline', offline);
    }
  };
}
