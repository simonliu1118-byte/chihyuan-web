import {validEquipmentDate,type EquipmentSnapshot,type MaintenanceVisit} from './store-equipment';
export type MaintenanceMatrixCustomer={customerCode:string;customerName:string;activeMaintenance:boolean;equipment:EquipmentSnapshot[];visits:MaintenanceVisit[]};
export type MaintenanceMatrixPage={rows:MaintenanceMatrixCustomer[];nextBefore:string|null;centerYear:number};
export type MaintenanceMatrixEntry={kind:'pending'|'overdue'|'partial'|'missing'|'moved'|'date';visits:MaintenanceVisit[];day?:string;targetMonth?:string;completedCount?:number;totalCount?:number};
export function maintenanceWindow(centerYear:number){if(!Number.isInteger(centerYear)||centerYear<2||centerYear>9998)throw new Error('維護年度不正確');const years=[centerYear-1,centerYear,centerYear+1].map(y=>String(y).padStart(4,'0'));return {years,from:years[0]+'-01',to:years[2]+'-12',months:years.flatMap(y=>Array.from({length:12},(_,i)=>y+'-'+String(i+1).padStart(2,'0')))}}
export function maintenanceVisitVisible(v:MaintenanceVisit,from:string,to:string){
 return v.month>=from&&v.month<=to||v.equipment.some(e=>e.completed&&!!e.completionDate&&e.completionDate.slice(0,7)>=from&&e.completionDate.slice(0,7)<=to)
   ||!v.equipment.length&&v.completed&&!!v.completionDate&&v.completionDate.slice(0,7)>=from&&v.completionDate.slice(0,7)<=to;
}
/** Read-only view: one client visit per customer/month, multiple machine dates. */
export function maintenanceMatrixCells(visits:readonly MaintenanceVisit[],months:readonly string[],today:string){
 const result=new Map<string,MaintenanceMatrixEntry[]>(months.map(m=>[m,[]]));
 const add=(month:string,entry:MaintenanceMatrixEntry)=>result.get(month)?.push(entry);
 const putDate=(v:MaintenanceVisit,date:string)=>{
   const month=date.slice(0,7),entries=result.get(month),sameDay=entries?.find(e=>e.kind==='date'&&e.day===date);
   if(sameDay){if(!sameDay.visits.some(row=>row.id===v.id))sameDay.visits.push(v);}
   else add(month,{kind:'date',day:date,visits:[v]});
   if(month!==v.month){
     const references=result.get(v.month),existing=references?.find(e=>e.kind==='moved'&&e.targetMonth===month&&e.visits.some(row=>row.id===v.id));
     if(!existing)add(v.month,{kind:'moved',targetMonth:month,visits:[v]});
   }
 };
 for(const v of visits){
   const equipped=v.equipment.length>0;
   const total=v.totalCount??v.equipment.length,done=v.completedCount??v.equipment.filter(e=>e.completed).length;
   const pending=equipped?v.equipment.some(e=>e.active&&!e.completed):!v.completed;
   if(pending)add(v.month,{kind:done>0?'partial':v.month<today.slice(0,7)?'overdue':'pending',visits:[v],completedCount:done,totalCount:total});
   const completed=equipped?v.equipment.filter(e=>e.completed).map(e=>e.completionDate):v.completed?[v.completionDate]:[];
   for(const date of [...new Set(completed)]){
     if(date&&validEquipmentDate(date))putDate(v,date);
     else add(v.month,{kind:'missing',visits:[v]});
   }
 }
 for(const entries of result.values())entries.sort((a,b)=>{if(a.kind==='date'&&b.kind==='date')return a.day!.localeCompare(b.day!);return Number(a.kind==='date')-Number(b.kind==='date')});
 return result;
}
