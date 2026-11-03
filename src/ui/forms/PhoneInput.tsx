import {useLayoutEffect,useRef,useState,type ClipboardEvent,type InputHTMLAttributes} from "react";
import {deletePhoneDigit,digitOffset,formatPhone,formatPhoneEntry,joinPhoneEntry,parsePhoneEntry,phoneCaret,phoneDigits,type PhoneKind} from "../../../shared/phone";
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"type"|"maxLength">&{value:string;onChange:(digits:string)=>void;kind?:PhoneKind};
/** Label/validation belongs to Field; this shared control owns formatting, editing and clipboard. */
export function PhoneInput({value,onChange,kind="phone",...props}:Props){
 const input=useRef<HTMLInputElement>(null),caret=useRef<number|null>(null),display=formatPhone(value,kind);
 useLayoutEffect(()=>{if(caret.current!==null&&input.current){const at=phoneCaret(display,caret.current);input.current.setSelectionRange(at,at);caret.current=null}});
 function copy(e:ClipboardEvent<HTMLInputElement>,cut=false){const node=e.currentTarget,start=node.selectionStart??0,end=node.selectionEnd??0;if(start===end)return;e.clipboardData.setData("text/plain",phoneDigits(node.value.slice(start,end)));e.preventDefault();if(cut){const next=deletePhoneDigit(node.value,start,end,false);caret.current=next.caret;onChange(next.value)}}
 return <input {...props} ref={input} type="tel" inputMode="tel" autoComplete={props.autoComplete??(kind==="mobile"?"tel-national":"tel")} value={display}
  onChange={e=>{caret.current=digitOffset(e.currentTarget.value,e.currentTarget.selectionStart??e.currentTarget.value.length);onChange(phoneDigits(e.currentTarget.value).slice(0,20))}}
  onCopy={e=>copy(e)} onCut={e=>copy(e,true)}
  onKeyDown={e=>{props.onKeyDown?.(e);if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.nativeEvent.isComposing||!['Backspace','Delete'].includes(e.key))return;const node=e.currentTarget,next=deletePhoneDigit(node.value,node.selectionStart??0,node.selectionEnd??0,e.key==='Backspace');e.preventDefault();caret.current=next.caret;onChange(next.value)}}/>;
}
/** Read-only phone selections also copy digits, without changing unrelated page selections. */
export function PhoneText({value,kind="phone"}:{value:string;kind?:PhoneKind}){
 return <span onCopy={e=>{const selection=window.getSelection();if(!selection||!selection.rangeCount||!e.currentTarget.contains(selection.anchorNode)||!e.currentTarget.contains(selection.focusNode))return;e.clipboardData.setData("text/plain",phoneDigits(selection.toString()));e.preventDefault()}}>{formatPhone(value,kind)}</span>;
}
/**
 * A phone with an optional extension typed after "#" (user 2026-11-03). The stored value is digits,
 * or digits#extension; it shows as (02)2345-6789 #12345 or 0912-345-678 once the cell is left.
 */
export function PhoneEntryInput({value,onChange,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"type">&{value:string;onChange:(stored:string)=>void}){
 const [typing,setTyping]=useState<string|null>(null);
 const shown=typing??phoneEntryText(value);
 return <input {...props} type="tel" inputMode="tel" autoComplete="off" value={shown}
  onFocus={e=>{setTyping(shown);props.onFocus?.(e)}}
  onBlur={e=>{setTyping(null);props.onBlur?.(e)}}
  onChange={e=>{const text=e.currentTarget.value.replace(/[^\d#()\- ]/g,"");setTyping(text);const p=parsePhoneEntry(text);onChange(joinPhoneEntry(p.number,p.extension))}}/>;
}
/** Display text for a stored digits#extension value. */
export function phoneEntryText(stored:string|null|undefined):string{
 if(!stored)return "";
 const p=parsePhoneEntry(stored);
 return formatPhoneEntry(p.number,p.extension);
}
