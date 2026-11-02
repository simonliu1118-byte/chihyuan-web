/** Shared store order/repair write primitives. */
export function storeVersionGuard(db:D1Database,table:"store_customer_orders"|"store_blacklist"|"store_repairs",id:number,version:number){
 return db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE id=? AND version=?) THEN 1 ELSE json('') END`).bind(id,version);
}
export function storeEvent(db:D1Database,table:"store_order_events"|"store_repair_events",column:"order_id"|"repair_id",id:number,actor:number,at:string,kind:string,before:unknown,after:unknown,reason:string,key:string){
 return db.prepare(`INSERT INTO ${table}(${column},actor,at,kind,before_json,after_json,reason,request_key) VALUES(?,?,?,?,?,?,?,?)`).bind(id,actor,at,kind,JSON.stringify(before),JSON.stringify(after),reason,key);
}
