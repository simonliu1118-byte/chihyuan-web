import type { KeyboardEvent } from "react";

const ENTER_ADVANCE_SELECTOR = '[data-enter-advance="true"]';
const SELECTABLE_INPUT_TYPES = new Set(["text", "search", "url", "tel", "password"]);

function isFocusableCandidate(element: HTMLElement): boolean {
  if (element.hidden) return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if (element.matches(":disabled")) return false;
  if (element.tabIndex < 0) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function shouldHandleEnter(target: HTMLElement, event: KeyboardEvent<HTMLElement>): boolean {
  if (event.defaultPrevented || event.isPropagationStopped()) return false;
  if (event.key !== "Enter") return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  if (event.nativeEvent.isComposing) return false;
  if (target.dataset.enterAdvance !== "true") return false;
  if (target.isContentEditable) return false;
  if (target.matches("textarea, button, a, select")) return false;
  if (target.getAttribute("role") === "combobox") return false;
  if (target.getAttribute("aria-expanded") === "true") return false;

  return true;
}

export function advanceFocusOnEnter(event: KeyboardEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (!shouldHandleEnter(target, event)) return false;

  const scope = event.currentTarget;
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(ENTER_ADVANCE_SELECTOR)).filter(
    isFocusableCandidate,
  );
  const currentIndex = candidates.indexOf(target);
  if (currentIndex < 0) return false;

  const next = candidates[currentIndex + 1];
  if (!next) return false;

  event.preventDefault();
  next.focus();
  if (next instanceof HTMLInputElement && SELECTABLE_INPUT_TYPES.has(next.type)) {
    next.select();
  }
  return true;
}
