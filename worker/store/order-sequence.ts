// The batch that inserts/moves an order also updates its affected display interval.
export function insertedOrderSequence(db:D1Database,id:number){return db.prepare("UPDATE store_customer_orders SET list_sequence=list_sequence+1 WHERE id<>? AND list_sequence>=(SELECT list_sequence FROM store_customer_orders WHERE id=?)").bind(id,id)}
export function movedOrderSequence(db:D1Database,id:number){return db.prepare(`
 WITH moved AS MATERIALIZED (
  SELECT o.id,o.list_sequence old,(SELECT COUNT(*)+1 FROM store_customer_orders x
   WHERE x.id<>o.id AND (x.order_date,julianday(x.created_at),x.id)<(o.order_date,julianday(o.created_at),o.id)) target
  FROM store_customer_orders o WHERE o.id=?
 ) UPDATE store_customer_orders SET list_sequence=CASE WHEN id=(SELECT id FROM moved) THEN (SELECT target FROM moved)
  WHEN (SELECT old<target FROM moved) THEN list_sequence-1 ELSE list_sequence+1 END
 WHERE (SELECT old<>target FROM moved) AND list_sequence BETWEEN (SELECT MIN(old,target) FROM moved) AND (SELECT MAX(old,target) FROM moved)
 `).bind(id)}
