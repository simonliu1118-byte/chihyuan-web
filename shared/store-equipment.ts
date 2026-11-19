/** Equipment dispatches and customer/month visits share one source of schedule data. */
export const EQUIPMENT_LIMITS={customerCode:40,customerName:80,brand:80,model:120,categoryOther:80,serialNo:80,assetNumber:80,note:300,quantity:1000,months:600} as const;
/** manufacturedMonth is retained for stored JSON compatibility: YYYY-MM or YYYY-MM-DD. */
export type EquipmentMachine={serialNo:string;manufacturedMonth:string;assetNumber:string};
import type {StoreRepairProductKind} from './store-repairs';
export type EquipmentFields={customerCode:string;customerName:string;brand:string;category:StoreRepairProductKind|'';categoryOther:string;model:string;saleDate:string;quantity:number;warrantyStart:string;warrantyEnd:string;machines:EquipmentMachine[];maintenance:boolean;months:string[]};
export type EquipmentRecord=EquipmentFields&{id:number;sequence:number;version:number;createdAt:string;updatedAt:string};
export type EquipmentSnapshot={id:number;sequence:number;brand:string;model:string;quantity:number;saleDate:string};
export type MaintenanceEquipment=EquipmentSnapshot&{completed:boolean;completionDate:string|null;note:string;active:boolean};
export type MaintenanceVisit={id:number;customerCode:string;customerName:string;month:string;completed:boolean;completionDate:string|null;note:string;completedCount:number;totalCount:number;version:number;equipment:MaintenanceEquipment[]};
export type EquipmentPage={rows:EquipmentRecord[];nextBefore:number|null};
export type MaintenancePage={rows:MaintenanceVisit[];nextBefore:string|null};
export function validEquipmentDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
export const validEquipmentMonth=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&v>='0001-01';
export const validManufacturedDate=(v:string)=>validEquipmentMonth(v)||validEquipmentDate(v);
export const equipmentCustomerCode=(v:string)=>v.trim().normalize('NFKC').toUpperCase();
export function shiftEquipmentMonth(value:string,delta:number){const n=Number(value.slice(0,4))*12+Number(value.slice(5))-1+delta;return String(Math.floor(n/12)).padStart(4,'0')+'-'+String(n%12+1).padStart(2,'0')}
/** Six-month suggestions never change when an actual visit is recorded late. */
export function halfYearMonths(start:string,end:string){if(!validEquipmentDate(start)||!validEquipmentDate(end)||end<start)return [];const result:string[]=[];for(let m=shiftEquipmentMonth(start.slice(0,7),6);m<=end.slice(0,7)&&result.length<EQUIPMENT_LIMITS.months;m=shiftEquipmentMonth(m,6))result.push(m);return result}
/** Inclusive warranty period: N months from the start ends the day before the anniversary. */
export function equipmentWarrantyEnd(start:string,months:number){if(!validEquipmentDate(start)||!Number.isInteger(months)||months<1||months>600)return '';const next=shiftEquipmentMonth(start.slice(0,7),months);if(!validEquipmentMonth(next))return '';const last=new Date(next+'-01T00:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);const d=new Date(next+'-01T00:00:00Z');d.setUTCDate(Math.min(Number(start.slice(8))-1,last.getUTCDate()));return d.toISOString().slice(0,10)}
/** Round up any partial inclusive calendar-month warranty to an integer number of months. */
/** The anniversary day is still in the same warranty month; a leap-day
 * rollover can legitimately be covered by one fewer calendar-month shift. */
export function equipmentWarrantyMonths(start:string,end:string){
 if(!validEquipmentDate(start)||!validEquipmentDate(end)||end<start)return '';
 const n=(Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5,7))-Number(start.slice(5,7));
 const covered=(months:number)=>{const last=equipmentWarrantyEnd(start,months);if(!last)return false;const next=new Date(last+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);return end<=next.toISOString().slice(0,10)};
 const candidate=Math.max(1,n-1);
 return String(covered(candidate)?candidate:covered(Math.max(1,n))?Math.max(1,n):Math.max(1,n+1));
}
export function equipmentSnapshot(r:EquipmentRecord):EquipmentSnapshot{return {id:r.id,sequence:r.sequence,brand:r.brand,model:r.model,quantity:r.quantity,saleDate:r.saleDate}}
