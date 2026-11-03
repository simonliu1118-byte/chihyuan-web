import { useState } from "react";

/**
 * A choice from a short preset list, or 其他 with the user's own text (user 2026-11-03: 付款條件
 * 月結／收現／其他, 發票開立 外加／內含／其他). The value is the preset or the typed text; empty is none.
 * Choosing 其他 without typing anything keeps the word 其他 itself (user 2026-11-03).
 */
export function PresetTextInput({ presets, value, onChange, className, disabled, maxLength }: {
  presets: readonly string[];
  value: string;
  onChange: (value: string) => void;
  className: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const OTHER = "其他";
  const [other, setOther] = useState(value !== "" && !presets.includes(value));
  const choice = other ? "__other" : value;
  return <span className={"cy-preset-text" + (other ? " other" : "")}>
    <select className={className} value={choice} disabled={disabled} aria-label="選項"
      onChange={event => {
        const next = event.target.value;
        setOther(next === "__other");
        onChange(next === "__other" ? OTHER : next);
      }}>
      <option value="">未設定</option>
      {presets.map(preset => <option key={preset} value={preset}>{preset}</option>)}
      <option value="__other">其他</option>
    </select>
    {other ? <input className={className} value={value === OTHER ? "" : value} disabled={disabled} maxLength={maxLength} aria-label="其他內容"
      placeholder="自行輸入" autoFocus onChange={event => onChange(event.target.value.trim() ? event.target.value : OTHER)} /> : null}
  </span>;
}
