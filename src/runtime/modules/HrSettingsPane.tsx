import type { FormEvent, ReactNode } from "react";
import { FormSection } from "../../ui/forms/Field";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { Dialog, type DialogSize } from "../../ui/overlays/Dialog";
import { StatusChip } from "../../ui/primitives/StatusChip";
import "./hr-settings.css";

/** One category of 人事設定: a header (title, hint, 「＋ 新增…」) above a single table. */
export function SettingsPane({ title, hint, actionLabel, onAction, actionDisabled, error, notice, children }: {
  title: string; hint?: ReactNode; actionLabel?: string; onAction?: () => void; actionDisabled?: boolean;
  error?: string | null; notice?: string | null; children: ReactNode;
}) {
  return <section className="cy-hrs-pane" aria-label={title}>
    <header className="cy-hrs-pane-head">
      <div><h3>{title}</h3>{hint ? <p>{hint}</p> : null}</div>
      {actionLabel ? <button type="button" className="cy-op-button primary" disabled={actionDisabled} onClick={onAction}>{actionLabel}</button> : null}
    </header>
    {error ? <p role="alert" className="cy-notice cy-notice-danger">{error}</p> : null}
    {notice ? <p role="status" className="cy-notice">{notice}</p> : null}
    {children}
  </section>;
}

export const ActiveChip = ({ active }: { active: boolean }) => <StatusChip tone={active ? "success" : "neutral"}>{active ? "啟用" : "停用"}</StatusChip>;

/** Table shell: plain scrolling wrapper so wide settings tables never widen the dialog. */
export function SettingsTable({ label, head, columns, empty, children }: { label: string; head: ReactNode; columns?: ReactNode; empty?: string; children: ReactNode }) {
  return <div className="cy-op-table-wrap cy-hrs-table-wrap"><table className="cy-op-table cy-hrs-table" aria-label={label}>
    {columns?<colgroup>{columns}</colgroup>:null}<thead><tr>{head}</tr></thead><tbody>{children}</tbody></table>
    {empty ? <p className="cy-op-empty">{empty}</p> : null}</div>;
}

/** Add / edit opens here instead of turning a table row into inputs. */
export function SettingsEditor({ title, size = "medium", busy, error, submitLabel = "儲存", note, onClose, onSubmit, children }: {
  title: string; note?: ReactNode; size?: DialogSize; busy: boolean; error?: string | null; submitLabel?: string;
  onClose: () => void; onSubmit: (event: FormEvent) => void; children: ReactNode;
}) {
  return <Dialog open title={title} size={size} dismissible={!busy} onClose={onClose}>
    <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={onSubmit}>
      {error ? <p role="alert" className="cy-notice cy-notice-danger">{error}</p> : null}
      <FormSection>{children}</FormSection>
      {note}
      <div className="cy-op-form-footer">
        <button key="cancel" type="button" className="cy-op-button" disabled={busy} onClick={onClose}>取消</button>
        <button key="save" type="submit" className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>{submitLabel}</button>
      </div>
    </form>
  </Dialog>;
}
