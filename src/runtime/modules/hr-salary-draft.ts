import type {HrPaymentType} from '../../../shared/hr';
interface SalarySnapshot {effective_date:string;payment_type:HrPaymentType;base_amount:number;allowances:readonly {item_type_id:number;amount:number;is_regular:number}[]}
/** Copy an effective saved salary into a new amendment; future records never become today's defaults. */
export function salaryAmendmentDraft<T extends SalarySnapshot>(records:readonly T[],today:string){
 const current=records.find(row=>row.effective_date<=today)??null;
 return {current,form:current?{effectiveDate:today,paymentType:current.payment_type,baseAmount:String(current.base_amount)}:{effectiveDate:today,paymentType:'monthly',baseAmount:''},
  allowances:current?.allowances.map(row=>({itemTypeId:String(row.item_type_id),amount:String(row.amount),isRegular:!!row.is_regular}))??[]};
}
