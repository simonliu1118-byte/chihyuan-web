import {useState,type FormEvent} from "react";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {Dialog} from "../../ui/overlays/Dialog";
import {Field} from "../../ui/forms/Field";
import {EntryTable,EntryHeading} from "../../ui/forms/EntryTable";
import {STORE_REPAIR_PRINT_LIMITS as LIMITS,type StoreRepairPrintSettings} from "../../../shared/store-repairs";

/**
 * 列印設定 (user 2026-11-04): the store types the slip's heading, contact lines and notes, and the
 * thermal 維修資訊卡's heading and footer. Kept in the database, never in the public code.
 */
export function StoreRepairPrintSettingsDialog({value,busy,onClose,onSave}:{value:StoreRepairPrintSettings;busy:boolean;onClose:()=>void;onSave:(next:StoreRepairPrintSettings&{expectedVersion:number})=>void}){
 const [draft,setDraft]=useState(value);
 const set=(patch:Partial<StoreRepairPrintSettings>)=>setDraft(d=>({...d,...patch}));
 const submit=(e:FormEvent)=>{e.preventDefault();onSave({...draft,expectedVersion:value.version})};
 const area=(label:string,key:"contact"|"notes"|"cardFooter",max:number,lines:number)=><Field label={label} presentation="cell">
  <textarea className="cy-ordering-cell" rows={lines} maxLength={max} placeholder={`每行一項，最多 ${lines} 行`} value={draft[key]} onChange={e=>set({[key]:e.target.value})}/></Field>;
 return <Dialog size="medium" open dismissible={false} title="列印設定" className="cy-repair-print-settings" onClose={()=>!busy&&onClose()}><form onKeyDown={enterAdvancesFields} onSubmit={submit}>
  <EntryTable label="維修單（點陣式）">
   <colgroup><col style={{width:"8em"}}/><col/></colgroup>
   <tbody>
    <tr><th scope="row" colSpan={2}><EntryHeading>維修單（點陣式印表機）</EntryHeading></th></tr>
    <tr><th scope="row">標題</th><td><Field label="維修單標題" presentation="cell"><input className="cy-ordering-cell" maxLength={LIMITS.title} value={draft.title} onChange={e=>set({title:e.target.value})}/></Field></td></tr>
    <tr><th scope="row">聯絡資訊</th><td>{area("聯絡資訊",'contact',LIMITS.contact,LIMITS.contactLines)}</td></tr>
    <tr><th scope="row">注意事項</th><td>{area("注意事項",'notes',LIMITS.notes,LIMITS.noteLines)}</td></tr>
    <tr><th scope="row" colSpan={2}><EntryHeading>維修資訊卡（熱感紙印表機）</EntryHeading></th></tr>
    <tr><th scope="row">標題</th><td><Field label="資訊卡標題" presentation="cell"><input className="cy-ordering-cell" maxLength={LIMITS.cardTitle} value={draft.cardTitle} onChange={e=>set({cardTitle:e.target.value})}/></Field></td></tr>
    <tr><th scope="row">下方文字</th><td>{area("資訊卡下方文字",'cardFooter',LIMITS.cardFooter,LIMITS.cardFooterLines)}</td></tr>
   </tbody>
  </EntryTable>
  <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>儲存</button></div>
 </form></Dialog>;
}
