import { useEffect, useId, useRef, useState } from "react";

export interface AccountMenuProps {
  displayName: string;
  employeeNo: string;
  roleLabel: string;
  /** SUPER_ADMIN / ADMIN tint the avatar like the role label. */
  role: string;
  /** Hide the name beside the avatar (phones). */
  compact?: boolean;
  signingOut?: boolean;
  onAccount: () => void;
  onLogout: () => void;
}

/** Top-right person button; its menu holds 我的帳號 and 登出 (appearance has its own switch). */
export function AccountMenu({ displayName, employeeNo, roleLabel, role, compact, signingOut, onAccount, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initial = displayName.slice(0, 1) || employeeNo.slice(0, 1);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  function pick(action: () => void) { setOpen(false); action(); }

  return <div className="cy-account-menu" data-role={role} ref={root}>
    <button type="button" className="cy-account-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      aria-label={compact ? `個人選單：${displayName}` : undefined} onClick={() => setOpen((value) => !value)}>
      <span className="cy-account-avatar" aria-hidden="true">{initial}</span>
      {compact ? null : <span className="cy-account-name"><strong>{displayName}</strong><span className="cy-account-role">{roleLabel}</span></span>}
      {compact ? null : <svg className="cy-account-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}
    </button>
    {open ? <div className="cy-account-popover" id={menuId} role="menu" aria-label="個人選單">
      <div className="cy-account-popover-head"><strong>{displayName}</strong><span>{employeeNo} · {roleLabel}</span></div>
      <button type="button" role="menuitem" onClick={() => pick(onAccount)}>我的帳號（密碼、Email）</button>
      <button type="button" role="menuitem" className="danger" disabled={signingOut} aria-busy={signingOut || undefined} onClick={() => pick(onLogout)}>登出</button>
    </div> : null}
  </div>;
}
