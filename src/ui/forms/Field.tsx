import { cloneElement, isValidElement, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";

/**
 * Field widths on the 12-column form grid (PROJECT_RULES §5):
 * s — short values (date, select, phone, number), four per row on a wide form;
 * m — names, email, codes, two per row; l — addresses, notes, full row.
 */
export type FieldSize = "s" | "m" | "l";

/**
 * A labelled control. `required` shows ＊ and puts `required` on the control, so the browser check
 * and the mark never disagree. `oneOf` notes a group where any one field is enough (e.g. 手機或市話);
 * `reportAs` names the field in the missing-fields alert when it differs from the label.
 */
export function Field({ label, required, oneOf, reportAs, size = "m", hint, children }: {
  label: ReactNode; required?: boolean; oneOf?: string; reportAs?: string; size?: FieldSize; hint?: ReactNode; children: ReactElement;
}) {
  const control = required && isValidElement(children) ? cloneElement(children as ReactElement<{ required?: boolean }>, { required: true }) : children;
  return <label className={`cy-f cy-f-${size}`} data-label={reportAs ?? (typeof label === "string" ? label : undefined)}>
    <span className="cy-f-label">{label}{required ? <span className="cy-field-required" aria-hidden="true">＊</span> : null}
      {oneOf ? <span className="cy-f-oneof">{oneOf}</span> : null}</span>
    {control}
    {hint ? <span className="cy-f-hint">{hint}</span> : null}
  </label>;
}

/** A checkbox laid out as a short field. */
export function CheckField({ label, size = "s", ...input }: { label: ReactNode; size?: FieldSize } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">) {
  return <label className={`cy-f-check cy-f-${size}`}><input type="checkbox" {...input} />{label}</label>;
}

/** A titled group of fields on the form grid; long forms use one per topic. */
export function FormSection({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return <section className="cy-f-section">
    {title ? <h3 className="cy-f-section-title">{title}</h3> : null}
    <div className="cy-f-grid">{children}</div>
  </section>;
}

/**
 * Makes a "at least one row" rule part of the browser check, so it is reported together with the
 * empty fields instead of in a second alert. Renders nothing visible.
 */
export function RequiredRows({ label, satisfied }: { label: string; satisfied: boolean }) {
  return satisfied ? null : <input className="cy-f-rows-required" required value="" onChange={() => undefined} tabIndex={-1} aria-hidden="true" data-label={label} />;
}
