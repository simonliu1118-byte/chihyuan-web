import {useEffect,useState,type InputHTMLAttributes} from "react";

/** HH:MM from typed digits: "930" → "09:30", "1745" → "17:45". Empty stays empty; anything else is invalid. */
export function parseTimeInput(text:string):string|null{
 const t=text.trim();if(!t)return "";
 const m=/^(\d{1,2}):?(\d{2})$/.exec(t);if(!m)return null;
 const h=Number(m[1]),min=Number(m[2]);
 return h<24&&min<60?String(h).padStart(2,"0")+":"+m[2]:null;
}

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,"type"|"value"|"onChange">&{value:string;onChange:(time:string)=>void};

/**
 * Shared time-of-day input (24-hour HH:MM). Same look as DateInput's text field, numeric keypad on
 * phones, no native time picker so every browser behaves alike. Emits "" or a valid "HH:MM".
 */
export function TimeInput({value,onChange,className="",disabled,...props}:Props){
 const [draft,setDraft]=useState(value);
 useEffect(()=>setDraft(value),[value]);
 const invalid=!disabled&&parseTimeInput(draft)===null;
 return <input {...props} type="text" inputMode="numeric" autoComplete="off" maxLength={5} placeholder={props.placeholder??"HH:MM"}
  className={className} disabled={disabled} value={draft} aria-invalid={invalid||undefined}
  ref={node=>node?.setCustomValidity(invalid?"請輸入有效時間（HH:MM，24 小時制）":"")}
  onChange={e=>{const text=e.target.value.replace(/[^\d:]/g,"");setDraft(text);const time=parseTimeInput(text);if(time!==null)onChange(time)}}
  onBlur={e=>{const time=parseTimeInput(draft);if(time!==null)setDraft(time);props.onBlur?.(e)}}/>;
}
