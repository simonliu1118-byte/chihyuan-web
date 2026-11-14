import { ApiClientError } from "../../../api/client";
import {useEffect,useState,type FormEvent} from 'react';
import type {ItemWebPlatform} from '../../../../shared/item';
import type {PlatformMarginRules,PlatformFee,QuantityDiscount,MarginCoupon} from '../../../../shared/item-online-margin';
import {loadItemPlatforms,loadPlatformMarginRules,savePlatformMarginRules} from '../../api/item-runtime-client';
import {RecordRows,type RowColumn} from '../../../ui/forms/RecordSheet';
import {EntryFields} from '../../../ui/forms/EntryFields';
import {CheckField} from '../../../ui/forms/Field';
import {Loading} from '../../../ui/feedback/Loading';
import {FeedbackBanner,useFeedbackMessage} from '../../../ui/feedback/FeedbackProvider';
import {enterAdvancesFields} from '../../../ui/foundation/enter-advance';
import {SETTINGS_SAVED_EVENT} from '../settings-events';

export function PlatformMarginSettings({onDirtyChange}:{onDirtyChange:(dirty:boolean)=>void}){
 const [platforms,setPlatforms]=useState<readonly ItemWebPlatform[]>([]),[platformId,setPlatformId]=useState<number|null>(null);
 const [draft,setDraft]=useState<PlatformMarginRules|null>(null),[saved,setSaved]=useState<PlatformMarginRules|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[epoch,setEpoch]=useState(0);
 const [message,setMessage,reportError,tone]=useFeedbackMessage<string|null>(null);
 const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false)},[dirty,onDirtyChange]);
 useEffect(()=>{let active=true;void loadItemPlatforms().then(rows=>{if(active){setPlatforms(rows);setPlatformId(rows[0]?.id??null);if(!rows.length)setLoading(false)}}).catch(e=>{if(active){reportError(String(e));setLoading(false)}});return()=>{active=false}},[]);
 useEffect(()=>{if(platformId==null)return;let active=true;setLoading(true);setDraft(null);setSaved(null);void loadPlatformMarginRules(platformId).then(r=>{if(active){setDraft(r);setSaved(r)}}).catch(e=>{if(active)reportError(e instanceof ApiClientError&&e.fields?Object.values(e.fields).join('；'):e instanceof Error?e.message:String(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[platformId,epoch]);
 const patch=(p:Partial<PlatformMarginRules>)=>setDraft(d=>d?{...d,...p}:d);
 const input=(value:string,change:(s:string)=>void,label:string)=> <input className="cy-op-input" aria-label={label} disabled={busy} value={value} onChange={e=>change(e.target.value)}/>;
 async function save(event:FormEvent){event.preventDefault();if(!draft)return;setBusy(true);setMessage(null);try{const r=await savePlatformMarginRules(draft);setDraft(r);setSaved(r);setMessage('平台費用與優惠已儲存');window.dispatchEvent(new CustomEvent(SETTINGS_SAVED_EVENT))}catch(e){reportError(e instanceof ApiClientError&&e.fields?Object.values(e.fields).join('；'):e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 const fees=(key:'basicFees'|'activityFees',title:string)=>{
  const rows=draft![key];const update=(i:number,p:Partial<PlatformFee>)=>patch({[key]:rows.map((r,n)=>n===i?{...r,...p}:r)});
  const columns:RowColumn<PlatformFee>[]=[
   {label:'費用名稱',required:true,view:r=>r.name,edit:(r,i)=>input(r.name,v=>update(i,{name:v}),'費用名稱')},
   {label:'計算方式',view:r=>r.method,edit:(r,i)=><select aria-label="計算方式" value={r.method} disabled={busy} onChange={e=>update(i,{method:e.target.value as PlatformFee['method']})}><option value="percent">百分比</option><option value="fixed">固定金額</option></select>},
   {label:'數值',required:true,view:r=>r.value,edit:(r,i)=>input(r.value,v=>update(i,{value:v}),'費用數值')},
   {label:'最低收費',view:r=>r.minimum,edit:(r,i)=>input(r.minimum??'',v=>update(i,{minimum:v||null}),'最低收費')},
   {label:'最高收費',view:r=>r.maximum,edit:(r,i)=>input(r.maximum??'',v=>update(i,{maximum:v||null}),'最高收費')},
  ];
  return <RecordRows title={title} editing rows={rows} columns={columns} rowKey={(_,i)=>i} busy={busy}
   onInsert={i=>{const next=[...rows];next.splice(i+1,0,{name:'',method:'percent',value:'',minimum:null,maximum:null});patch({[key]:next})}}
   onRemove={i=>patch({[key]:rows.filter((_,n)=>n!==i)})}/>;
 };
 if(loading)return <Loading/>;
 if(!platforms.length)return <p>請先新增網路平台。</p>;
 if(!draft)return <><FeedbackBanner message={message} tone={tone}/><button className="cy-op-button compact soft" onClick={()=>setEpoch(v=>v+1)}>重新載入</button></>;
 const updateTier=(i:number,p:Partial<QuantityDiscount>)=>patch({tiers:draft.tiers.map((r,n)=>n===i?{...r,...p}:r)});
 const updateCoupon=(i:number,p:Partial<MarginCoupon>)=>patch({coupons:draft.coupons.map((r,n)=>n===i?{...r,...p}:r)});
 return <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={event=>void save(event)}>
  <FeedbackBanner message={message} tone={tone}/>
  <EntryFields label="平台費用" rows={[{label:'平台',content:<select aria-label="平台" value={platformId??''} disabled={busy||dirty} onChange={e=>setPlatformId(Number(e.target.value))}>{platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}]} />
  <p>設定套用至此平台全部商品；儲存即生效。基本及活動費率各至少一項，零費用請明確填0。百分比費用依優惠後含稅售價計算，固定費與運費按單件扣除，金額按賣家支出額計入。</p>
  {fees('basicFees','基本費率')}{fees('activityFees','活動費率')}
  <CheckField label="賣家負擔運費" checked={draft.shipping.enabled} disabled={busy} onChange={e=>patch({shipping:{...draft.shipping,enabled:e.target.checked}})}/>
  {draft.shipping.enabled?<EntryFields label="賣家運費" rows={[
   {label:'貨運別',required:true,content:input(draft.shipping.carrier,v=>patch({shipping:{...draft.shipping,carrier:v}}),'貨運別')},
   {label:'金額',required:true,content:input(draft.shipping.amount,v=>patch({shipping:{...draft.shipping,amount:v}}),'運費金額')},
  ]}/>:null}
  <RecordRows title="滿件折扣" editing rows={draft.tiers} rowKey={(_,i)=>i} busy={busy}
   columns={[
    {label:'滿件數',required:true,view:r=>r.quantity,edit:(r,i)=>input(String(r.quantity),v=>updateTier(i,{quantity:Number(v)}),'滿件數')},
    {label:'折數',required:true,view:r=>r.discount,edit:(r,i)=>input(r.discount,v=>updateTier(i,{discount:v}),'滿件折數')},
   ]} onInsert={i=>{const rows=[...draft.tiers];rows.splice(i+1,0,{quantity:2,discount:''});patch({tiers:rows})}} onRemove={i=>patch({tiers:draft.tiers.filter((_,n)=>i!==n)})}/>
  <RecordRows title="優惠券／滿額折價" editing rows={draft.coupons} rowKey={(_,i)=>i} busy={busy}
   columns={[
    {label:'活動／優惠券名稱',required:true,view:r=>r.name,edit:(r,i)=>input(r.name,v=>updateCoupon(i,{name:v}),'優惠券名稱')},
    {label:'折扣方式',view:r=>r.method,edit:(r,i)=><select aria-label="優惠券折扣方式" value={r.method} disabled={busy} onChange={e=>updateCoupon(i,{method:e.target.value as MarginCoupon['method']})}><option value="percent">折數</option><option value="fixed">金額</option></select>},
    {label:'折數／金額',required:true,view:r=>r.value,edit:(r,i)=>input(r.value,v=>updateCoupon(i,{value:v}),'優惠券折數或金額')},
    {label:'滿額門檻',required:true,view:r=>r.threshold,edit:(r,i)=>input(r.threshold,v=>updateCoupon(i,{threshold:v}),'滿額門檻')},
    {label:'折抵上限',view:r=>r.cap,edit:(r,i)=>input(r.cap??'',v=>updateCoupon(i,{cap:v||null}),'折抵上限')},
   ]} onInsert={i=>{const rows=[...draft.coupons];rows.splice(i+1,0,{name:'',method:'fixed',value:'',threshold:'',cap:null});patch({coupons:rows})}} onRemove={i=>patch({coupons:draft.coupons.filter((_,n)=>i!==n)})}/>
  <p><strong>優惠券一律不可並用；每張券都與滿件折扣一起計算。</strong> 折數按上限封頂，例如9折、滿600、上限20合法，於600元時折20元。</p>
  <p>金額以整數元比較各券門檻：滿600折20、下一門檻800時，計算600至799的兩端，再按商品占比換算折抵。最後一檔固定／封頂券以折抵占比趨零作理論上界；無上限折數券保留原折數。</p>
  <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>{setDraft(saved);setEpoch(v=>v+1)}}>取消並重讀</button><button className="cy-op-button primary" disabled={busy||(!dirty&&draft.revision>0)}>儲存平台設定</button></div>
 </form>;
}
