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
  const validationPending = useRef(false);
  const notify: Notify = useCallback((message, title = "操作提醒", options) => {
    const translated = chineseMessage(message);
    setQueue(current => options?.replace ? [{ message: translated, title }]
      : current.some(item => item.message === translated) ? current : [...current, { message: translated, title }]);
  }, []);
  const close = useCallback(() => setQueue(current => current.slice(1)), []);
  const alert = queue[0];
  function invalid(event: InvalidEvent<HTMLDivElement>) {
    event.preventDefault();
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) || validationPending.current) return;
    validationPending.current = true;
    queueMicrotask(() => { validationPending.current = false; });
    const label = input.labels?.[0]?.textContent?.replace(/\*/g, "").trim() || "此欄位";
    const validity = input.validity;
    const detail = validity.valueMissing ? `請填寫${label}。`
      : validity.typeMismatch && input instanceof HTMLInputElement && input.type === "email" ? "請輸入有效的電子郵件地址。"
      : validity.rangeUnderflow || validity.rangeOverflow ? `${label}超出允許範圍，請確認最小值與最大值。`
      : validity.tooLong || validity.tooShort ? `${label}的字數不符合要求。`
      : validity.badInput || validity.stepMismatch ? `${label}的數值格式不正確。`
      : `${label}的格式不正確，請檢查後重新輸入。`;
    input.focus();
    notify(detail, "請檢查輸入內容");
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
