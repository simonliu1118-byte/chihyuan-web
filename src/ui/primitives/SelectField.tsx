import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { FieldFrame } from "./FieldFrame";

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}

export function SelectField({
  id,
  label,
  description,
  error,
  required,
  className = "",
  children,
  ...selectProps
}: SelectFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `cy-select-${generatedId}`;
  const describedBy = error
    ? `${inputId}-error`
    : description
      ? `${inputId}-description`
      : undefined;

  return (
    <FieldFrame
      label={label}
      htmlFor={inputId}
      description={description}
      error={error}
      required={required}
    >
      <select
        {...selectProps}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={["cy-input", "cy-select", className].filter(Boolean).join(" ")}
      >
        {children}
      </select>
    </FieldFrame>
  );
}
