import type {PropsWithChildren} from "react";

/**
 * The page's main actions (儲存、送出、新增…). Desktop: a right-aligned row like `cy-op-form-footer`.
 * Phone: fixed to the bottom of the screen, full-width buttons, above the home indicator, so the
 * primary action stays reachable while the list scrolls. Put secondary actions in OverflowMenu.
 */
export function ActionBar({children,label="主要操作"}:PropsWithChildren<{label?:string}>){
 return <><div className="cy-action-bar" role="group" aria-label={label}>{children}</div><div className="cy-action-bar-spacer" aria-hidden="true"/></>;
}
