import { useSyncExternalStore } from "react";

const query = "(max-width: 820px)";
function subscribe(changed: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}
/** Presentation only. Business state and authorization stay with their existing owners. */
export function useCompactLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
