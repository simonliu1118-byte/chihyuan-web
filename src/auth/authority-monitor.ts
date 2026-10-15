/** Read-only browser freshness, never an authorization or Session authority. */
export const AUTHORITY_CHECK_INTERVAL_MS = 30_000;

export function createAuthorityMonitor<T>(options: {
  load: (signal: AbortSignal) => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => boolean;
  visible: () => boolean;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let active = true, running = false, forced = false, epoch = 0, lastStarted = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const later = (delay: number) => {
    clear();
    if (active && options.visible()) timer = schedule(() => { timer = undefined; void check(); }, delay);
  };
  async function check(force = false) {
    if (!active) return;
    if (force) { ++epoch; forced = true; }
    if (!options.visible()) { clear(); return; }
    if (running) return;
    const delay = 1_000 - (now() - lastStarted);
    if (delay > 0) { later(delay); return; }
    clear();
    running = true; forced = false; lastStarted = now();
    const ticket = epoch;
    controller = new AbortController();
    const deadline = schedule(() => controller?.abort(), 10_000);
    try {
      const value = await options.load(controller.signal);
      if (active && ticket === epoch) options.onValue(value);
    } catch (error) {
      if (active && ticket === epoch && options.onError(error)) active = false;
    } finally {
      cancel(deadline); controller = undefined; running = false;
      if (active) later(forced ? 0 : AUTHORITY_CHECK_INTERVAL_MS);
    }
  }
  return {
    start(immediate = false) { later(immediate ? 0 : AUTHORITY_CHECK_INTERVAL_MS); },
    refresh: (force = false) => { void check(force); },
    stop() { active = false; ++epoch; clear(); controller?.abort(); },
  };
}
