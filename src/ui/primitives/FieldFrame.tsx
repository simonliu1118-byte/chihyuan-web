import type { PropsWithChildren, ReactNode } from "react";

export interface FieldFrameProps {
  label: ReactNode;
  htmlFor: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

export function FieldFrame({
  children,
  label,
  htmlFor,
  description,
  error,
  required = false,
  className = "",
}: PropsWithChildren<FieldFrameProps>) {
  return (
    <div className={["cy-field", error ? "has-error" : "", className].filter(Boolean).join(" ")}>
      <label className="cy-field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="cy-field-required" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? (
        <div className="cy-field-error" id={`${htmlFor}-error`} role="alert">
          {error}
        </div>
      ) : description ? (
        <div className="cy-field-description" id={`${htmlFor}-description`}>
          {description}
        </div>
      ) : null}
    </div>
  );
}
