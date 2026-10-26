import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren, type InvalidEvent } from "react";
import { Dialog } from "../overlays/Dialog";
import { Button } from "../primitives/Button";
import { chineseMessage } from "../../api/error-messages";

type Alert = { message: string; title: string };
type Notify = (message: string, title?: string, options?: { replace?: boolean }) => void;
const FeedbackContext = createContext<Notify | null>(null);

/** One explicit feedback owner. No request interception or DOM observation. */
export function FeedbackProvider({ children }: PropsWithChildren) {
  const [queue, setQueue] = useState<Alert[]>([]);
  // Every control the browser rejects in one submit, reported together in a single alert.
  const invalidBatch = useRef<{ input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; label: string; problem: string | null }[]>([]);
  const notify: Notify = useCallback((message, title = "操作提醒", options) => {
    const translated = chineseMessage(message);
    // replace: a newer alert of the same kind (same title) supersedes the older one; others stay queued.
    setQueue(current => options?.replace ? [...current.filter(item => item.title !== title), { message: translated, title }]
      : current.some(item => item.message === translated) ? current : [...current, { message: translated, title }]);
  }, []);
  const close = useCallback(() => setQueue(current => current.slice(1)), []);
  const alert = queue[0];
  function invalid(event: InvalidEvent<HTMLDivElement>) {
    event.preventDefault();
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) return;
    const label = fieldName(input);
    const validity = input.validity;
    const problem = validity.valueMissing ? null
      : validity.typeMismatch && input instanceof HTMLInputElement && input.type === "email" ? `${label}不是有效的電子郵件地址`
      : validity.rangeUnderflow || validity.rangeOverflow ? `${label}超出允許範圍`
      : validity.tooLong || validity.tooShort ? `${label}的字數不符合要求`
      : validity.badInput || validity.stepMismatch ? `${label}的數值格式不正確`
      : validity.customError ? `${label}${input.validationMessage}`
      : `${label}的格式不正確`;
    // The browser fires one invalid event per field; gather them and speak once after the last.
    if (!invalidBatch.current.length) setTimeout(flushInvalid, 0);
    invalidBatch.current.push({ input, label, problem });
  }
  function flushInvalid() {
    const batch = invalidBatch.current;
    invalidBatch.current = [];
    if (!batch.length) return;
    const missing = [...new Set(batch.filter(x => x.problem === null).map(x => x.label))];
    const lines = [missing.length ? `請填寫：${missing.join("、")}。` : "", ...batch.filter(x => x.problem).map(x => x.problem + "。")].filter(Boolean);
    for (const { input } of batch) {
      input.setAttribute("aria-invalid", "true");
      // One shared handler: adding it again on the next failed submit is a no-op, so nothing piles up.
      input.addEventListener("input", clearInvalid);
      input.addEventListener("change", clearInvalid);
    }
    const first = batch.find(x => !x.input.classList.contains("cy-f-rows-required"))?.input;
    first?.focus();
    notify(lines.join("\n"), "請檢查輸入內容", { replace: true });
  }
  return <FeedbackContext.Provider value={notify}>
    <div style={{ display: "contents" }} onInvalidCapture={invalid}>{children}</div>
    {alert ? <Dialog key={alert.message} open title={alert.title} size="small" onClose={close}
      footer={<div className="cy-dialog-action-row"><Button type="button" onClick={close}>知道了</Button></div>}>
      <p className="cy-feedback-message" role="alert">{alert.message}</p>
    </Dialog> : null}
  </FeedbackContext.Provider>;
}

export function useFeedback() {
  const notify = useContext(FeedbackContext);
  if (!notify) throw new Error("FeedbackProvider is required");
  return notify;
}

/** Keeps page feedback while making each reported failure explicit, including repeated attempts. */
/**
 * Page message plus its tone: setMessage reports a result (green), reportError a failure (red,
 * also raised as an alert). Render it with FeedbackBanner so every page uses the same colours.
 */
export function useFeedbackMessage<T extends string | null>(initial: T) {
  const [message, setRawMessage] = useState<T>(initial);
  const [tone, setTone] = useState<FeedbackTone>("success");
  const mounted = useRef(true);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notify = useFeedback();
  const setMessage = useCallback((value: T) => { setTone("success"); setRawMessage(value); }, []);
  const reportError = useCallback((value: T) => {
    if (!mounted.current) return;
    const translated = value ? chineseMessage(value) as T : value;
    setTone("danger");
    setRawMessage(translated);
    if (translated) notify(translated);
  }, [notify]);
  return useMemo(() => [message, setMessage, reportError, tone] as const, [message, setMessage, reportError, tone]);
}

export type FeedbackTone = "success" | "danger";

export function FeedbackBanner({ message, tone }: { message: string | null; tone: FeedbackTone }) {
  return message ? <div className={`cy-notice cy-notice-${tone}`} role={tone === "danger" ? "alert" : "status"}>
    <div className="cy-notice-body">{message}</div></div> : null;
}

/** The name a user sees for a control: the shared field's label, else the wrapping label's own text. */
function fieldName(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const named = input.dataset.label ?? input.closest<HTMLElement>("[data-label]")?.dataset.label;
  if (named) return named;
  const label = input.labels?.[0];
  const own = label ? Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? "").join("").replace(/[*＊]/g, "").trim() : "";
  return own || input.getAttribute("aria-label") || input.getAttribute("placeholder") || "此欄位";
}

function clearInvalid(event: Event) {
  (event.currentTarget as Element).removeAttribute("aria-invalid");
}
