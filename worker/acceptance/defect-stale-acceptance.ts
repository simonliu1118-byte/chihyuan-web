import type { DefectStatusCode } from "../../shared/defect";
import { DefectPersistence } from "../defect/defect-persistence";
import { DefectRepository, type DefectRecordState } from "../defect/defect-repository";
import { DefectService, DefectServiceError } from "../defect/defect-service";

/** Isolated D1 lifecycle plus captured-preflight replays; no live fixtures. */
export async function acceptDefectStaleAudit(db:D1Database,customerId:number,itemId:number):Promise<void>{
  const service=new DefectService(db),repository=new DefectRepository(db),persistence=new DefectPersistence(db);
  const context={actorMemberId:1,now:"2026-10-02T04:00:00.000Z"};
  const profile={customerId,itemId,ownerEmployeeId:1,reportedDate:"2026-10-02",defectDescription:"Isolated stale Defect acceptance",handling:null};
  async function state(id:number):Promise<DefectRecordState>{
    const value=await repository.getRecordState(id);
    if(!value)throw new Error("ACCEPT_DEFECT_STATE_MISSING");
    return value;
  }
  async function snapshot(id:number):Promise<string>{
    const results=await db.batch([
      db.prepare("SELECT * FROM defect_reports WHERE id=? ORDER BY id").bind(id),
      db.prepare("SELECT * FROM audit_events WHERE entity_type='defect' AND entity_key=? ORDER BY id").bind(String(id)),
    ]);
    return JSON.stringify(results.map(row=>row.results));
  }
  async function actions(id:number):Promise<string[]>{
    const rows=await db.prepare("SELECT action FROM audit_events WHERE entity_type='defect' AND entity_key=? ORDER BY id")
      .bind(String(id)).all<{action:string}>();
    return rows.results.map(row=>row.action);
  }
  async function rejected(id:number,code:string,status:number,operation:()=>Promise<unknown>):Promise<void>{
    const before=await snapshot(id);
    let caught=false;
    try{await operation();}catch(error){
      if(!(error instanceof DefectServiceError)||error.code!==code||error.status!==status)throw error;
      caught=true;
    }
    if(!caught||await snapshot(id)!==before)throw new Error("ACCEPT_DEFECT_REJECTION_"+code);
  }
  async function replay(id:number,operation:()=>Promise<boolean>):Promise<void>{
    const before=await snapshot(id);
    if(await operation()||await snapshot(id)!==before)throw new Error("ACCEPT_DEFECT_STALE_AUDIT_OR_MUTATION");
  }
  const record=await service.create(profile,context);
  let current=record;
  const transitions:readonly [DefectStatusCode,DefectStatusCode,string][]=[
    ["created","processing","defect.processing.started"],
    ["processing","resolved","defect.resolved"],
    ["resolved","processing","defect.reopened"],
  ];
  const expectedActions:string[]=[];
  for(const [from,to,action] of transitions){
    const captured=current,input={expectedRevision:captured.revision,reason:"isolated lifecycle"};
    current=to==="resolved"?await service.resolve(record.id,input,context):from==="resolved"?
      await service.reopen(record.id,input,context):await service.startProcessing(record.id,input,context);
    expectedActions.push(action);
    if(current.statusCode!==to||current.revision!==captured.revision+1||JSON.stringify(await actions(record.id))!==JSON.stringify(expectedActions))throw new Error("ACCEPT_DEFECT_WINNER_TRANSITION");
    await replay(record.id,()=>persistence.transition(record.id,from,to,input,context));
    await rejected(record.id,"DEFECT_REVISION_CONFLICT",409,()=>service.startProcessing(record.id,input,context));
    if(to==="resolved")await rejected(record.id,"DEFECT_EDIT_NOT_ALLOWED",409,()=>service.update(record.id,{...profile,expectedRevision:current.revision},context));
  }
  // The same timestamp deliberately makes the former invalidation predicate
  // match a previous winner, rather than accidentally hiding the regression.
  const captured=await state(record.id),input={expectedRevision:captured.revision,reason:"isolated invalidation"};
  current=await service.invalidate(record.id,input,context);
  expectedActions.push("defect.invalidated");
  if(current.statusCode!=="processing"||current.invalidatedAt!==context.now||current.revision!==captured.revision+1||JSON.stringify(await actions(record.id))!==JSON.stringify(expectedActions))throw new Error("ACCEPT_DEFECT_INVALIDATION_WINNER");
  await replay(record.id,()=>persistence.invalidate(captured,input,context));
  await rejected(record.id,"DEFECT_INVALIDATED",409,()=>service.resolve(record.id,{expectedRevision:current.revision},context));
  await rejected(record.id,"DEFECT_INVALIDATED",409,()=>service.update(record.id,{...profile,expectedRevision:current.revision},context));
  const visible=await service.search({customerId,itemId,limit:100});
  const includingInvalid=await service.search({customerId,itemId,includeInvalid:true,limit:100});
  if(visible.items.some(row=>row.id===record.id)||!includingInvalid.items.some(row=>row.id===record.id))throw new Error("ACCEPT_DEFECT_INVALID_VISIBILITY");

  const resolvedRecord=await service.create(profile,context);
  const processing=await service.startProcessing(resolvedRecord.id,{expectedRevision:resolvedRecord.revision},context);
  const resolved=await service.resolve(resolvedRecord.id,{expectedRevision:processing.revision},context);
  const resolvedState=await state(resolvedRecord.id),resolvedInput={expectedRevision:resolved.revision,reason:null};
  const invalidResolved=await service.invalidate(resolvedRecord.id,resolvedInput,context);
  if(invalidResolved.statusCode!=="resolved"||invalidResolved.revision!==resolved.revision+1||invalidResolved.invalidatedAt!==context.now)throw new Error("ACCEPT_DEFECT_RESOLVED_INVALIDATION");
  await replay(resolvedRecord.id,()=>persistence.invalidate(resolvedState,resolvedInput,context));
  if(JSON.stringify(await actions(resolvedRecord.id))!==JSON.stringify(["defect.processing.started","defect.resolved","defect.invalidated"]))throw new Error("ACCEPT_DEFECT_RESOLVED_AUDIT");

  const deletable=await service.create(profile,context);
  await rejected(deletable.id,"DEFECT_TRANSITION_NOT_ALLOWED",422,()=>service.invalidate(deletable.id,{expectedRevision:deletable.revision},context));
  await rejected(deletable.id,"DEFECT_DELETE_NOT_ALLOWED",403,()=>service.deleteCreated(deletable.id,{expectedRevision:deletable.revision},{...context,actorMemberId:2}));
  const beforeEdit=await state(deletable.id);
  const edited=await service.update(deletable.id,{...profile,handling:"isolated correction",expectedRevision:deletable.revision},context);
  await replay(deletable.id,()=>persistence.deleteCreated(beforeEdit,context));
  if(edited.revision!==deletable.revision+1||(await actions(deletable.id)).length!==0)throw new Error("ACCEPT_DEFECT_ORDINARY_EDIT_AUDIT");
  const deleteState=await state(deletable.id);
  await service.deleteCreated(deletable.id,{expectedRevision:edited.revision},context);
  if(await repository.getDetail(deletable.id)!==null||JSON.stringify(await actions(deletable.id))!==JSON.stringify(["defect.deleted"]))throw new Error("ACCEPT_DEFECT_DELETE_WINNER");
  await replay(deletable.id,()=>persistence.deleteCreated(deleteState,context));
}
