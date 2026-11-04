import {handleStoreEquipmentRoute} from '../http/store-equipment-routes';
import type {IdentityRuntimeEnv} from '../http/auth-routes';
import type {EquipmentRecord,MaintenancePage,MaintenanceVisit} from '../../shared/store-equipment';
/** The real handlers and local D1, including JSON set writes and aggregate conflict guards. */
export async function acceptEquipmentMaintenance(db:D1Database){
 const at='2026-11-05T03:00:00.000Z';
 await db.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES('equipment-acceptance','9998','合成驗收',1,?,?)").bind(at,at).run();
 const principal={workspaceId:'workspace-equipment',employeeId:'equipment-acceptance',employeeNo:'9998',displayName:'合成驗收',workspaceRole:'SUPER_ADMIN',isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:true,credentialVersion:1,employeeRevision:1};
 const env:IdentityRuntimeEnv={DB:db,IDENTITY_APPLICATION_ID:'APP_TEST',IDENTITY_WORKSPACE_ID:'workspace-equipment',IDENTITY:{connect(){throw new Error('ACCEPTANCE_UNUSED_SOCKET')},async fetch(){return Response.json({principal,session:{expiresAt:'2999-01-01T00:00:00Z'}})}}};
 const call=async<T>(path:string,method='GET',body?:unknown,status=200):Promise<T>=>{const response=await handleStoreEquipmentRoute(new Request('https://acceptance.invalid/api/business/store/equipment'+path,{method,headers:{cookie:'cyweb_identity_session=cyid_'+'b'.repeat(64),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,'equipment-d1',at);if(response?.status!==status)throw new Error('EQUIPMENT_D1_STATUS:'+path+':'+response?.status+':'+await response?.text());return ((await response.json()) as {data:T}).data};
 const fields={customerCode:'SYNTHETIC-EQ',customerName:'合成醫院',brand:'合成品牌',model:'合成型號',saleDate:'2026-05-01',quantity:1,warrantyStart:'2026-05-01',warrantyEnd:'2028-04-30',machines:[{serialNo:'SYNTHETIC-001',manufacturedMonth:'2026-01'}],maintenance:true,months:['2026-11','2027-05']};
 const key=crypto.randomUUID(),first=await call<EquipmentRecord>('','POST',{...fields,requestKey:key});
 const replay=await call<EquipmentRecord>('','POST',{...fields,requestKey:key});if(first.id!==replay.id)throw new Error('EQUIPMENT_D1_REPLAY');
 await call<EquipmentRecord>('','POST',{...fields,model:'第二型號',requestKey:crypto.randomUUID()});
 const list=await call<MaintenancePage>('/visits');if(list.rows.length!==2||list.rows.some(r=>r.equipment.length!==2))throw new Error('EQUIPMENT_D1_GROUP');
 const v=list.rows[0],payload={expectedVersion:v.version,requestKey:crypto.randomUUID(),completed:true,completionDate:null,note:'已前往維護'};
 const done=await call<MaintenanceVisit>('/visits/'+v.id,'PUT',payload);if(!done.completed||done.note!==payload.note||done.completionDate!==null)throw new Error('EQUIPMENT_D1_COMPLETION');
 await call('/visits/'+v.id,'PUT',{...payload,requestKey:crypto.randomUUID()},409);
 await call('','POST',{...fields,requestKey:crypto.randomUUID()},409);
 const count=await db.prepare('SELECT COUNT(*) n FROM store_equipment_records').first<{n:number}>();if(count?.n!==2)throw new Error('EQUIPMENT_D1_ROLLBACK');
 const disabled=await call<EquipmentRecord>('','POST',{...fields,customerCode:'',maintenance:false,months:[],requestKey:crypto.randomUUID()});
 await call('/'+disabled.id,'PUT',{...disabled,maintenance:true,months:['2026-11'],expectedVersion:disabled.version,requestKey:crypto.randomUUID()},422);
 const history=await call<{rows:unknown[]}>('/visits/'+v.id+'/history');if(history.rows.length!==1)throw new Error('EQUIPMENT_D1_HISTORY');
}
