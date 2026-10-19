export type HrStatus = "probation" | "active" | "leave" | "terminated";
export type HrPaymentType = "monthly" | "hourly";
export interface HrContact { name: string; relationship: string | null; phone: string }
export interface HrEducation { school: string; department: string | null; degree: string | null; graduationMonth: string | null }
export interface HrWorkHistory { company: string; jobTitle: string | null; startMonth: string | null; endMonth: string | null; note: string | null }
export interface HrEmployee {
 id: number; employeeNo: string; name: string; status: HrStatus;
 memberId: number | null; nationalIdMasked: string | null;
 birthDate: string | null; gender: string | null; mobile: string | null; phone: string | null;
 mailingAddress: string | null; registeredAddress: string | null;
 hireDate: string; seniorityStartDate: string; terminationDate: string | null;
 terminationReason: string | null; note: string | null; revision: number;
 contacts: HrContact[]; education: HrEducation[]; workHistory: HrWorkHistory[];
}
export interface HrSalaryAllowance { itemTypeId: number; amount: number; isRegular: boolean }
export interface HrSalaryRecord { id: number; effectiveDate: string; paymentType: HrPaymentType; baseAmount: number; reason: string; allowances: HrSalaryAllowance[] }
export interface HrStatusChange { id: number; effectiveDate: string; previousStatus: HrStatus; nextStatus: HrStatus; reason: string }
export interface HrMinimumWage { effectiveDate: string; monthlyAmount: number; hourlyAmount: number }
