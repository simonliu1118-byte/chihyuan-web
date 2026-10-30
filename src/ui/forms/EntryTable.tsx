import type {PropsWithChildren, ReactNode} from "react";
import "./entry-table.css";

/** Shared table shell for form-local drafts; saving remains owned by the enclosing form. */
export function EntryTable({label, embedded=false, className="", children}:PropsWithChildren<{label:string;embedded?:boolean;className?:string}>){
 const table=<table aria-label={label} className={`cy-ordering-grid cy-entry-table ${className}`}>{children}</table>;
 return embedded?table:<div className="cy-ordering-grid-scroll">{table}</div>;
}

/** The visible label belongs to the header; the cell Field retains its accessible label. */
export function EntryHeading({children,required=false}: {children:ReactNode;required?:boolean}){
 return <>{children}{required?<span className="cy-field-required" aria-hidden="true">＊</span>:null}</>;
}
