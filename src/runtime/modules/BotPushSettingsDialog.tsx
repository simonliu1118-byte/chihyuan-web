import {useRef,useState,type FormEvent} from 'react';
import {Dialog} from '../../ui/overlays/Dialog';
import {EntryTable,EntryHeading} from '../../ui/forms/EntryTable';
import {Field} from '../../ui/forms/Field';
import {enterAdvancesFields} from '../../ui/foundation/enter-advance';
import {ApiClientError} from '../../api/client';

export function BotPushSettingsDialog({label,configured,enabled,onSave,onClose}:{label:string;configured:boolean;enabled:boolean;onSave:(value:{url:string;key:string;enabled:boolean})=>Promise<void>;onClose:()=>void}){
 const [url,setUrl]=useState(''),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const saving=useRef(false);
 async function save(event:FormEvent){event.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);setError(null);
  try{await onSave({url,key:secret,enabled})}catch(e){setError(e instanceof ApiClientError?e.message:'推播設定暫時無法儲存')}finally{saving.current=false;setBusy(false)}
 }
 return <Dialog open title={label+'推播設定'} size="medium" dismissible={false} showCloseButton={false} onClose={onClose}
  footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={onClose}>取消</button><button type="submit" form="cy-bot-push-form" className="cy-op-button primary" disabled={busy}>儲存</button></div>}>
  <form id="cy-bot-push-form" onKeyDown={enterAdvancesFields} onSubmit={event=>void save(event)}>
   {error?<p role="alert">{error}</p>:null}
   <EntryTable label="推播設定" className="cy-bot-form-table"><colgroup><col style={{width:"10em"}}/><col/></colgroup>
    <tbody><tr><th scope="row"><EntryHeading required={!configured}>Webhook 網址</EntryHeading></th>
     <td><Field label="Webhook 網址" presentation="cell" required={!configured}><input type="password" className="cy-ordering-cell" value={url} onChange={event=>setUrl(event.target.value)} maxLength={2048} autoComplete="off" placeholder={configured?'保留原值':undefined} disabled={busy}/></Field></td></tr>
    <tr><th scope="row"><EntryHeading required={!configured}>Webhook 密鑰</EntryHeading></th>
     <td><Field label="Webhook 密鑰" presentation="cell" required={!configured}><input type="password" className="cy-ordering-cell" value={secret} onChange={event=>setSecret(event.target.value)} maxLength={1024} autoComplete="new-password" placeholder={configured?'保留原值':undefined} disabled={busy}/></Field></td></tr></tbody>
   </EntryTable>
  </form>
 </Dialog>;
}
