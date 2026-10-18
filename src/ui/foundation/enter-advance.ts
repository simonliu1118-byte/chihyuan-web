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

const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
  "select",
  "textarea",
].join(", ");

function submitButtonOf(form: HTMLFormElement): HTMLButtonElement | null {
  const inside = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
  if (inside && isFocusableCandidate(inside)) return inside;
  if (!form.id) return null;
  const outside = document.querySelector<HTMLButtonElement>(`button[type="submit"][form="${CSS.escape(form.id)}"]`);
  return outside && isFocusableCandidate(outside) ? outside : null;
}

/**
 * Data-entry forms: Enter moves to the next field instead of saving.
 * - Textareas keep Enter for new lines; buttons keep their own Enter.
 * - An open autocomplete list keeps Enter for picking a result.
 * - After the last field, Enter moves to the save button (a second Enter on it saves),
 *   or saves directly when `submitOnLast` is set (short dialogs such as a reason prompt).
 * - Ctrl/⌘+Enter saves from any field.
 */
function enterToNextField(event: KeyboardEvent<HTMLFormElement>, submitOnLast: boolean) {
  if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing) return;
  const form = event.currentTarget;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !form.contains(target)) return;

  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    form.requestSubmit(submitButtonOf(form) ?? undefined);
    return;
  }
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  if (!target.matches(FIELD_SELECTOR) || target.matches("textarea")) return;
  if (target.getAttribute("aria-expanded") === "true") {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  const fields = Array.from(form.querySelectorAll<HTMLElement>(FIELD_SELECTOR))
    .filter(element => isFocusableCandidate(element) && !(element as HTMLInputElement).readOnly);
  const next = fields[fields.indexOf(target) + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement && SELECTABLE_INPUT_TYPES.has(next.type)) next.select();
    return;
  }
  const submit = submitButtonOf(form);
  if (submitOnLast) form.requestSubmit(submit ?? undefined);
  else submit?.focus();
}

/** Record editors: Enter walks through the fields and stops on the save button. */
export function enterAdvancesFields(event: KeyboardEvent<HTMLFormElement>) {
  enterToNextField(event, false);
}

/** Short dialogs (a reason, a code, a password change): Enter on the last field submits. */
export function enterAdvancesThenSubmits(event: KeyboardEvent<HTMLFormElement>) {
  enterToNextField(event, true);
}
