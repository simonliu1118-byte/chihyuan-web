/** Preserve the mounted editor until a decision; hash/back cancellation adds no history entry. */
export function createGuardedHashNavigation<Route extends string>(options: {
  initial: Route;
  canLeave: () => Promise<boolean>;
  write: (route: Route, replace: boolean) => void;
  commit: (route: Route) => void;
}) {
  let current = options.initial;
  let pending = false;
  let epoch = 0;
  return {
    async request(next: Route, origin: "link" | "hash"): Promise<boolean> {
      if (next === current) return true;
      if (origin === "hash") options.write(current, true);
      if (pending) return false;
      pending = true;
      const ticket = ++epoch;
      try {
        if (!(await options.canLeave()) || ticket !== epoch) return false;
        current = next;
        options.commit(next);
        options.write(next, origin === "hash");
        return true;
      } catch {
        return false;
      } finally {
        if (ticket === epoch) pending = false;
      }
    },
    // Permission/session enforcement must never wait for a discard decision.
    replace(next: Route) {
      ++epoch;
      pending = false;
      current = next;
      options.commit(next);
      options.write(next, true);
    },
  };
}
