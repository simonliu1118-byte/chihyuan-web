import type { MouseEventHandler } from "react";
import { Icons } from "../actions/icons";

/**
 * Icon-only 設定 button shared by every module's page tools: no border or fill, light hover, placed right after the page
 * title on desktop and in the top-bar right cluster on phones. The accessible name and tooltip are 「<模組>設定」.
 */
export function ModuleSettingsGear({ moduleLabel, onClick, expanded }: { moduleLabel: string; onClick: MouseEventHandler<HTMLButtonElement>; expanded?: boolean }) {
  const label = `${moduleLabel}設定`;
  return <button type="button" className="cy-shell-gear" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={expanded} onClick={onClick}>{Icons.settings}</button>;
}
