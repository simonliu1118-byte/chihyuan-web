interface IconButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** Square icon-only action with the same sizing tokens as other compact buttons. */
export function IconButton({ icon, label, onClick, disabled = false }: IconButtonProps) {
  return <button type="button" className="cy-op-button compact cy-icon-button"
    title={label} aria-label={label} disabled={disabled} onClick={onClick}>
    <span aria-hidden="true">{icon}</span>
  </button>;
}
