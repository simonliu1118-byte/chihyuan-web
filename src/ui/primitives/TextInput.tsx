import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { FieldFrame } from "./FieldFrame";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}

export function TextInput({
  id,
  label,
  description,
  error,
  required,
  className = "",
  ...inputProps
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? `cy-input-${generatedId}`;
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
      <input
        {...inputProps}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={["cy-input", className].filter(Boolean).join(" ")}
      />
    </FieldFrame>
  );
}
