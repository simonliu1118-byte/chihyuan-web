import {useRef,useState} from 'react';
import {SegmentedControl} from '../../ui/primitives/SegmentedControl';
import {useNavigationGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {HrBonusPanel} from './HrBonusPanel';
import {HrEmployerSupplement} from './HrEmployerSupplement';
import {HrSalaryOverview} from './HrSalaryOverview';
import {HrPayrollMonthly} from './HrPayrollMonthly';
import type {PayrollNavTarget} from './HrPayrollDetail';
export {ProfileEditor} from './HrPayrollProfileEditor';

export type SalaryMode='settings'|'monthly'|'bonus'|'supplement';
/** 離開薪資頁（例如到出勤補正）再回來時要還原的位置。 */
export interface SalaryView {mode:SalaryMode;month?:string;employeeId?:number|null}
const modes:{value:SalaryMode;label:string}[]=[{value:'settings',label:'薪資設定'},{value:'monthly',label:'每月薪資'},{value:'bonus',label:'獎金發放'},{value:'supplement',label:'公司補充保費'}];

/** 薪資：薪資設定｜每月薪資｜獎金發放｜公司補充保費。 */
export function HrSalaryPanel(props:{onRaise:(id:number,name:string)=>void;refreshToken:number;onNavigate?:(target:PayrollNavTarget)=>void;initialView?:SalaryView;onViewChange?:(view:SalaryView)=>void}){
 const [mode,setMode]=useState<SalaryMode>(props.initialView?.mode??'settings'),navigation=useNavigationGuard();
 const view=useRef<SalaryView>(props.initialView??{mode});
 function report(patch:Partial<SalaryView>){view.current={...view.current,...patch};props.onViewChange?.(view.current);}
 async function change(next:SalaryMode){if(next!==mode&&await navigation.canLeave()){setMode(next);report({mode:next});}}
 return <><SegmentedControl label="薪資頁籤" compact value={mode} options={modes} onChange={next=>void change(next)}/>
  {mode==='settings'?<HrSalaryOverview onRaise={props.onRaise} refreshToken={props.refreshToken}/>
   :mode==='monthly'?<HrPayrollMonthly initialMonth={props.initialView?.month} initialEmployeeId={props.initialView?.employeeId??null} refreshToken={props.refreshToken} onRaise={props.onRaise} onNavigate={props.onNavigate}
     onViewChange={v=>report({month:v.month,employeeId:v.employeeId})}/>
   :mode==='bonus'?<HrBonusPanel/>:<HrEmployerSupplement/>}</>;
}
