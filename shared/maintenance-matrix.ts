import {validEquipmentDate,type EquipmentSnapshot,type MaintenanceVisit} from './store-equipment';
export type MaintenanceMatrixCustomer={customerCode:string;customerName:string;activeMaintenance:boolean;equipment:EquipmentSnapshot[];visits:MaintenanceVisit[]};
export type MaintenanceMatrixPage={rows:MaintenanceMatrixCustomer[];nextBefore:string|null;centerYear:number};
export type MaintenanceMatrixEntry={kind:'pending'|'overdue'|'missing'|'moved'|'date';visits:MaintenanceVisit[];day?:string;targetMonth?:string};
export function maintenanceWindow(centerYear:number){if(!Number.isInteger(centerYear)||centerYear<2||centerYear>9998)throw new Error('維護年度不正確');const years=[centerYear-1,centerYear,centerYear+1].map(y=>String(y).padStart(4,'0'));return {years,from:years[0]+'-01',to:years[2]+'-12',months:years.flatMap(y=>Array.from({length:12},(_,i)=>y+'-'+String(i+1).padStart(2,'0')))}}
export function maintenanceVisitVisible(v:MaintenanceVisit,from:string,to:string){return v.month>=from&&v.month<=to||v.completed&&!!v.completionDate&&v.completionDate.slice(0,7)>=from&&v.completionDate.slice(0,7)<=to}
/** Read projection only: a date belongs to the actual month, the source schedule stays independent. */
export function maintenanceMatrixCells(visits:readonly MaintenanceVisit[],months:readonly string[],today:string){
 const result=new Map<string,MaintenanceMatrixEntry[]>(months.map(m=>[m,[]]));
 const add=(month:string,entry:MaintenanceMatrixEntry)=>result.get(month)?.push(entry);
 for(const v of visits){
  if(!v.completed){add(v.month,{kind:v.month<today.slice(0,7)?'overdue':'pending',visits:[v]});continue}
  if(!v.completionDate||!validEquipmentDate(v.completionDate)){add(v.month,{kind:'missing',visits:[v]});continue}
  const actual=v.completionDate.slice(0,7),entries=result.get(actual);
  const sameDay=entries?.find(e=>e.kind==='date'&&e.day===v.completionDate);
  if(sameDay)sameDay.visits.push(v);else add(actual,{kind:'date',day:v.completionDate,visits:[v]});
  if(actual!==v.month)add(v.month,{kind:'moved',targetMonth:actual,visits:[v]});
 }
 for(const entries of result.values())entries.sort((a,b)=>{if(a.kind==='date'&&b.kind==='date')return a.day!.localeCompare(b.day!);return Number(a.kind==='date')-Number(b.kind==='date')});
 return result;
}
