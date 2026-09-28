import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonTone = "primary" | "secondary" | "danger" | "quiet";
type ButtonSize = "small" | "medium";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
  busy?: boolean;
}

export function Button({
  children,
  className = "",
  tone = "primary",
  size = "medium",
  busy = false,
  disabled,
  ...props
}: PropsWithChildren<ButtonProps>) {
  const classes = ["cy-button", `cy-button-${tone}`, `cy-button-${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {children}
    </button>
  );
}
