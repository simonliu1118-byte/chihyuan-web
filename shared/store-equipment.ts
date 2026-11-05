/** Equipment dispatches and customer/month visits share one source of schedule data. */
export const EQUIPMENT_LIMITS={customerCode:40,customerName:80,brand:80,model:120,serialNo:80,note:300,quantity:1000,months:600} as const;
export type EquipmentMachine={serialNo:string;manufacturedMonth:string};
export type EquipmentFields={customerCode:string;customerName:string;brand:string;model:string;saleDate:string;quantity:number;warrantyStart:string;warrantyEnd:string;machines:EquipmentMachine[];maintenance:boolean;months:string[]};
export type EquipmentRecord=EquipmentFields&{id:number;sequence:number;version:number;createdAt:string;updatedAt:string};
export type EquipmentSnapshot={id:number;sequence:number;brand:string;model:string;quantity:number;saleDate:string};
export type MaintenanceVisit={id:number;customerCode:string;customerName:string;month:string;completed:boolean;completionDate:string|null;note:string;version:number;equipment:EquipmentSnapshot[]};
export type EquipmentPage={rows:EquipmentRecord[];nextBefore:number|null};
export type MaintenancePage={rows:MaintenanceVisit[];nextBefore:string|null};
export function validEquipmentDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
export const validEquipmentMonth=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&v>='0001-01';
export const equipmentCustomerCode=(v:string)=>v.trim().normalize('NFKC').toUpperCase();
export function shiftEquipmentMonth(value:string,delta:number){const n=Number(value.slice(0,4))*12+Number(value.slice(5))-1+delta;return String(Math.floor(n/12)).padStart(4,'0')+'-'+String(n%12+1).padStart(2,'0')}
/** Six-month suggestions never change when an actual visit is recorded late. */
export function halfYearMonths(start:string,end:string){if(!validEquipmentDate(start)||!validEquipmentDate(end)||end<start)return [];const result:string[]=[];for(let m=shiftEquipmentMonth(start.slice(0,7),6);m<=end.slice(0,7)&&result.length<EQUIPMENT_LIMITS.months;m=shiftEquipmentMonth(m,6))result.push(m);return result}
/** Add calendar months on the same day; clamp a missing day to the target month's last day. */
export function equipmentWarrantyEnd(start:string,months:number){if(!validEquipmentDate(start)||!Number.isInteger(months)||months<1||months>600)return '';const next=shiftEquipmentMonth(start.slice(0,7),months);if(!validEquipmentMonth(next))return '';const last=new Date(next+'-01T00:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);return next+'-'+String(Math.min(Number(start.slice(8)),last.getUTCDate())).padStart(2,'0')}
/** Calendar-month difference rounded up, independent of day-count precision. */
export function equipmentWarrantyMonths(start:string,end:string){if(!validEquipmentDate(start)||!validEquipmentDate(end)||end<start)return '';const n=(Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5,7))-Number(start.slice(5,7));return String(n+(Number(end.slice(8))>Number(start.slice(8))?1:0))}
export function equipmentSnapshot(r:EquipmentRecord):EquipmentSnapshot{return {id:r.id,sequence:r.sequence,brand:r.brand,model:r.model,quantity:r.quantity,saleDate:r.saleDate}}
