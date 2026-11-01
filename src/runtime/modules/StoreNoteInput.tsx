import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {wrapStoreNote} from "../../../shared/store-note";
export function StoreNoteInput({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [draft,setDraft]=useState(value),composing=useRef(false),last=useRef(value),field=useRef<HTMLTextAreaElement>(null),caret=useRef<number|null>(null);
 useEffect(()=>{if(!composing.current){setDraft(value);last.current=value}},[value]);
 useLayoutEffect(()=>{if(caret.current!==null&&field.current){field.current.setSelectionRange(caret.current,caret.current);caret.current=null}},[draft]);
 function accept(text:string){const wrapped=wrapStoreNote(text),shrinkingLegacy=wrapStoreNote(last.current)===null&&Array.from(text).length<Array.from(last.current).length;if(wrapped===null&&!shrinkingLegacy){if(field.current)field.current.value=last.current;setDraft(last.current);return}const next=wrapped??text;setDraft(next);last.current=next;onChange(next)}
 return <textarea ref={field} className="cy-ordering-cell" rows={3} maxLength={300} aria-label="備註" value={draft} wrap="soft"
  onCompositionStart={()=>{composing.current=true}} onCompositionEnd={e=>{composing.current=false;accept(e.currentTarget.value)}}
  onChange={e=>{if(composing.current){setDraft(e.currentTarget.value);return}accept(e.currentTarget.value)}}
  onKeyDown={e=>{if(e.nativeEvent.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.key!=="Backspace")return;const node=e.currentTarget,start=node.selectionStart;if(start!==node.selectionEnd||draft[start-1]!=="\n")return;const before=draft.slice(0,start-1).split("\n").at(-1)??"";if(Array.from(before).length!==15)return;e.preventDefault();const previous=Array.from(draft.slice(0,start-1));previous.pop();const text=previous.join("")+draft.slice(start);caret.current=Math.max(0,previous.join("").length);accept(text)}}/>;
}
