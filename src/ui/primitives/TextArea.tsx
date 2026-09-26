import { useId } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { FieldFrame } from "./FieldFrame";

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}

export function TextArea({
  id,
  label,
  description,
  error,
  required,
  className = "",
  ...textareaProps
}: TextAreaProps) {
  const generatedId = useId();
  const inputId = id ?? `cy-textarea-${generatedId}`;
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
      <textarea
        {...textareaProps}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={["cy-input", "cy-textarea", className].filter(Boolean).join(" ")}
      />
    </FieldFrame>
  );
}
