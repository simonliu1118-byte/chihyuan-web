import {Field,CheckField} from "../../../ui/forms/Field";
import {DateInput} from "../../../ui/forms/DateInput";
/** Shared milestone date and "no date" controls for orders and repairs. */
export function StoreMilestoneDateFields({label,value,withoutDate,min,max,required=true,allowWithoutDate=true,onChange,disabled=false}:{
 label:string;value:string;withoutDate:boolean;min:string;max:string;required?:boolean;allowWithoutDate?:boolean;
 onChange:(patch:{value?:string;withoutDate?:boolean})=>void;disabled?:boolean;
}){
 return <div className="cy-store-date-choice">
  <Field label={label+"日期"} required={required&&!withoutDate} size="s">
   <DateInput aria-label={label+"日期"} className="cy-op-input" value={withoutDate?"":value} disabled={disabled||withoutDate} min={min} max={max} onChange={value=>onChange({value})}/>
  </Field>
  {allowWithoutDate?<CheckField label="無日期" size="s" data-enter-skip="true" disabled={disabled} checked={withoutDate} onChange={e=>onChange({withoutDate:e.target.checked})}/>:null}
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

/** One milestone control for order and repair. The owner supplies the workflow semantics. */
export function StoreMilestoneButton({day,baseYear,pending=false,unreached=false,disabled=false,label,title,onClick}:{
 day:string|null;baseYear:string;pending?:boolean;unreached?:boolean;disabled?:boolean;label:string;title?:string;onClick:()=>void;
}){
 return <button type="button" className={"cy-store-date-link "+(unreached?"cy-store-unreached":pending?"cy-store-register":!day?"cy-store-check":"")} disabled={disabled} title={title} aria-label={label} onClick={onClick}>
  {pending?"登記":<StoreMilestoneStamp day={day} baseYear={baseYear}/>}
  {unreached?<span className="cy-store-unreached-mark" aria-label="未接通">!</span>:null}
 </button>;
}
