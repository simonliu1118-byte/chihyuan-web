import type {ButtonHTMLAttributes} from "react";
import {Icons} from "./icons";
import "./reorder-handle.css";
/** Shared row grip; the caller owns the draft order and its save boundary. */
export function ReorderHandle({label,...props}:Omit<ButtonHTMLAttributes<HTMLButtonElement>,"type"|"children"|"className"|"aria-label">&{label:string}){
 return <button {...props} type="button" className="cy-lookup-handle" aria-label={label}>{Icons.grip}</button>;
}
