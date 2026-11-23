export const BONUS_CATEGORIES=['年終獎金','開工獎金','端午禮金','中秋禮金','生日禮金','其他'] as const;
export interface BonusResult {
 gross:number;deductions:number;net:number;taxRegular:number;taxBonus:number;
 bonusGross:number;regularTaxable:number;nhiPremium:number;nhiIncome:number;nhiUnitKey:string;
 issues:string[];profileId:number|null;taxRuleId:number|null;policyId:number|null;
}
export interface BonusPayment {
 id:number;employee_id:number;employee_no:string;name:string;amount:number;note:string;result:BonusResult;
}
export interface BonusBatch {
 id:number;pay_date:string;category:string;attribution_year:number|null;status:'draft'|'paid'|'void';
 revision:number;void_reason:string;payments:BonusPayment[];
}
export interface BonusHistoryRow extends BonusPayment {
 batch_id:number;pay_date:string;category:string;attribution_year:number|null;status:BonusBatch['status'];
}
