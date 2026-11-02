import {Field} from "../../../ui/forms/Field";
import {STORE_REPAIR_CARRIERS,type StoreRepairCarrier} from "../../../../shared/store-repairs";
export function StoreShippingFields({carrier,tracking,onChange,disabled=false}:{carrier:StoreRepairCarrier|"";tracking:string;onChange:(patch:{carrier?:StoreRepairCarrier;tracking?:string})=>void;disabled?:boolean}){
 return <div className="cy-repair-shipping-fields">
  <Field label="物流" required size="m"><select className="cy-op-input" required value={carrier} disabled={disabled} onChange={e=>onChange({carrier:e.target.value as StoreRepairCarrier})}><option value="">請選擇</option>{Object.entries(STORE_REPAIR_CARRIERS).map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></Field>
  <Field label={carrier==="SELF"?"註記":"寄送編號"} required={!!carrier&&carrier!=="SELF"} size="m"><input className="cy-op-input" maxLength={120} value={tracking} disabled={disabled||!carrier} onChange={e=>onChange({tracking:e.target.value})}/></Field>
 </div>;
}
