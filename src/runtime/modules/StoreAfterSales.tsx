import {useState} from 'react';
import {SegmentedControl} from '../../ui/primitives/SegmentedControl';
import {StoreRepairs} from './StoreRepairs';
import {StoreEquipmentRecords,StoreMaintenanceVisits} from './StoreEquipment';
/** One shared switch below the existing 門市 tabs; no nested switch inside equipment. */
export function StoreAfterSales(){
 const [view,setView]=useState<'repairs'|'equipment'|'maintenance'>('repairs'),[customer,setCustomer]=useState(''),[selectedId,setSelectedId]=useState<number>();
 return <div className="cy-store-after-sales">
  <SegmentedControl label="售後維修" value={view} onChange={v=>{setCustomer('');setSelectedId(undefined);setView(v)}} options={[{value:'repairs',label:'門市送修'},{value:'equipment',label:'出機紀錄'},{value:'maintenance',label:'定期維護'}]}/>
  {view==='repairs'?<StoreRepairs/>:view==='equipment'?<StoreEquipmentRecords selectedId={selectedId} onVisits={code=>{setCustomer(code);setView('maintenance')}}/>:<StoreMaintenanceVisits initialCustomer={customer} onEquipment={id=>{setSelectedId(id);setView('equipment')}}/>}
 </div>;
}
