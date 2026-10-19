import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return <span className="cy-password-input">
    <input {...props} className={["cy-op-input", props.className].filter(Boolean).join(" ")} type={visible ? "text" : "password"} />
    <button type="button" className="cy-password-visibility" aria-label={visible ? "隱藏密碼" : "顯示密碼"} aria-pressed={visible} onClick={() => setVisible(value => !value)}>👁</button>
  </span>;
}
