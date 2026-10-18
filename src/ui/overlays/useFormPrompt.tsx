import { enterAdvancesThenSubmits } from "../foundation/enter-advance";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Dialog } from "./Dialog";

export interface PromptField {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  multiline?: boolean;
  inputMode?: "text" | "numeric" | "decimal";
}

export interface FormPromptRequest {
  title: string;
  description?: string;
  fields: readonly PromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "primary" | "danger";
}

type PromptValues = Record<string, string>;

/**
 * Shared replacement for window.prompt: one small form dialog per decision.
 * Resolves with trimmed values, or null when cancelled or the screen unmounts.
 */
export function useFormPrompt() {
  const [request, setRequest] = useState<FormPromptRequest | null>(null);
  const [values, setValues] = useState<PromptValues>({});
  const resolve = useRef<((values: PromptValues | null) => void) | null>(null);
  const formId = useId();

  const finish = useCallback((result: PromptValues | null) => {
    const pending = resolve.current;
    resolve.current = null;
    setRequest(null);
    pending?.(result);
  }, []);
  useEffect(() => () => { resolve.current?.(null); resolve.current = null; }, []);

  const ask = useCallback((next: FormPromptRequest): Promise<PromptValues | null> => {
    if (resolve.current) return Promise.resolve(null);
    setValues(Object.fromEntries(next.fields.map(field => [field.name, field.defaultValue ?? ""])));
    return new Promise<PromptValues | null>(done => { resolve.current = done; setRequest(next); });
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!request) return;
    const trimmed = Object.fromEntries(request.fields.map(field => [field.name, (values[field.name] ?? "").trim()]));
    if (request.fields.some(field => field.required && !trimmed[field.name])) return;
    finish(trimmed);
  }

  const promptDialog = request ? <Dialog open title={request.title} description={request.description} size="small"
    onClose={() => finish(null)}
    footer={<div className="cy-dialog-action-row">
      <button type="button" className="cy-op-button" onClick={() => finish(null)}>{request.cancelLabel ?? "取消"}</button>
      <button type="submit" form={formId} className={`cy-op-button ${request.confirmTone === "danger" ? "danger-solid" : "primary"}`}>{request.confirmLabel ?? "確認"}</button>
    </div>}>
    <form onKeyDown={enterAdvancesThenSubmits} id={formId} className="cy-prompt-form" onSubmit={submit}>
      {request.fields.map((field, index) => <label key={field.name}>
        <span>{field.label}{field.required ? <span className="cy-field-required"> *</span> : null}</span>
        {field.multiline
          ? <textarea className="cy-op-input" rows={3} autoFocus={index === 0} required={field.required} placeholder={field.placeholder}
              value={values[field.name] ?? ""} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />
          : <input className="cy-op-input" autoFocus={index === 0} required={field.required} placeholder={field.placeholder} inputMode={field.inputMode}
              value={values[field.name] ?? ""} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />}
        {field.description ? <small>{field.description}</small> : null}
      </label>)}
    </form>
  </Dialog> : null;

  return { ask, promptDialog };
}
