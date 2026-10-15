// Transport reports gate failures to the one mounted AuthGate freshness owner.
// No credentials, principal data, permissions or Session state are stored here.
const listeners = new Set<() => void>();
export function subscribeAuthorityRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function requestAuthorityRefresh() {
  for (const listener of listeners) listener();
}
