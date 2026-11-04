/**
 * Text boxes grow with their content (user 2026-11-04). Browsers with CSS `field-sizing: content`
 * do this on their own (forms.css); for the others this sizes a textarea to its content whenever it
 * is typed in or focused. The ordering grid's multi-line cells size themselves and are skipped.
 */
export function installTextAutosize(): void {
  if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) return;
  const fit = (event: Event) => {
    const box = event.target;
    if (!(box instanceof HTMLTextAreaElement) || box.classList.contains("cy-ordering-multiline")) return;
    box.style.height = "auto";
    box.style.height = box.scrollHeight + 2 + "px";
  };
  document.addEventListener("input", fit);
  document.addEventListener("focusin", fit);
}
