import {Field,CheckField} from "../../../ui/forms/Field";
import {DateInput} from "../../../ui/forms/DateInput";
/** Shared milestone date and "no date" controls for orders and repairs. */
export function StoreMilestoneDateFields({label,value,withoutDate,min,max,required=true,onChange,disabled=false}:{
 label:string;value:string;withoutDate:boolean;min:string;max:string;required?:boolean;
 onChange:(patch:{value?:string;withoutDate?:boolean})=>void;disabled?:boolean;
}){
 return <div className="cy-store-date-choice">
  <Field label={label+"日期"} required={required&&!withoutDate} size="s">
   <DateInput aria-label={label+"日期"} className="cy-op-input" value={withoutDate?"":value} disabled={disabled||withoutDate} min={min} max={max} onChange={value=>onChange({value})}/>
  </Field>
  <CheckField label="無日期" size="s" data-enter-skip="true" disabled={disabled} checked={withoutDate} onChange={e=>onChange({withoutDate:e.target.checked})}/>
 </div>;
}
export function StoreMilestoneStamp({day,baseYear}:{day:string|null;baseYear:string}){
 if(!day)return <>✓</>;
 const crossYear=day.slice(0,4)!==baseYear.slice(0,4);
 return <span className={"cy-store-date-stamp"+(crossYear?" has-year":"")}>
  {crossYear?<small className="cy-store-date-year">{day.slice(0,4)}</small>:null}
  <span className="cy-store-date-day">{day.slice(5).replace("-","/")}</span>
 </span>;
}
