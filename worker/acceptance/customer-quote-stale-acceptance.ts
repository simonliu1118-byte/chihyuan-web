import { CustomerRelatedMutationRepository } from "../customer/customer-related-mutation-repository";
import { CustomerRelatedRepository } from "../customer/customer-related-repository";
import { CustomerRelatedService, CustomerRelatedServiceError } from "../customer/customer-related-service";
import { normalizeCorrectQuoteRequest } from "../customer/customer-related-validation";

/** Captured preflight requests replay against isolated D1 with identical actor/time. */
export async function acceptCustomerQuoteStaleMutation(db: D1Database, customerId: number, itemId: number): Promise<void> {
  const service = new CustomerRelatedService(db);
  const repository = new CustomerRelatedRepository(db);
  const mutations = new CustomerRelatedMutationRepository(db);
  const context = { actorMemberId: 1, now: "2026-10-02T09:30:00.000Z" };
  const original = { itemId, quoteDate: "2026-10-02", employeeId: 1, priceBreaks: [
    { quantity: "1.25", unit: "EA", unitPrice: "2.3456", note: "isolated input", sortOrder: 0 },
    { quantity: "10", unit: "EA", unitPrice: "2", sortOrder: 1 },
  ] };
  const quote = await service.createQuote(customerId, original, context);
  async function snapshot(): Promise<string> {
    const rows = await db.batch([
      db.prepare("SELECT * FROM customer_item_quotes WHERE id=?").bind(quote.id),
      db.prepare("SELECT * FROM quote_price_breaks WHERE quote_id=? ORDER BY id").bind(quote.id),
      db.prepare("SELECT * FROM audit_events WHERE entity_type='customer_item_quote' AND entity_key=? ORDER BY id").bind(String(quote.id)),
    ]);
    return JSON.stringify(rows.map(row => row.results));
  }
  const captured = await repository.getQuoteDetail(customerId, quote.id);
  if (!captured) throw new Error("ACCEPT_QUOTE_CAPTURE_MISSING");
  const item = { id: captured.itemId, itemNo: captured.itemNoSnapshot, name: captured.itemNameSnapshot, spec: captured.specSnapshot };
  const correction = { ...original, expectedRevision: captured.revision, correctionReason: "correct isolated input",
    priceBreaks: [{ quantity: "1.25", unit: "EA", unitPrice: "2.1234", note: "corrected input", sortOrder: 0 }] };
  const winner = await service.correctQuote(customerId, quote.id, correction, context);
  if (winner.id !== quote.id || winner.revision !== captured.revision + 1 || winner.priceBreaks.length !== 1 || winner.priceBreaks[0]?.unitPrice !== "2.1234") {
    throw new Error("ACCEPT_QUOTE_CORRECTION_READBACK");
  }
  const audit = await db.prepare("SELECT action,before_json,after_json,metadata_json FROM audit_events WHERE entity_type='customer_item_quote' AND entity_key=? ORDER BY id")
    .bind(String(quote.id)).all<{ action: string; before_json: string; after_json: string; metadata_json: string }>();
  if (audit.results.length !== 1 || audit.results[0]?.action !== "corrected") throw new Error("ACCEPT_QUOTE_AUDIT_COUNT");
  const event = audit.results[0];
  if (JSON.parse(event.before_json).priceBreaks.length !== 2 || JSON.parse(event.after_json).priceBreaks[0]?.unitPrice !== "2.1234"
    || JSON.parse(event.metadata_json).correctionReason !== correction.correctionReason) throw new Error("ACCEPT_QUOTE_AUDIT_PAYLOAD");
  const saved = await snapshot();
  // Replay the successful request, then a different captured request with multiple breaks.
  for (const raw of [correction, { ...correction, priceBreaks: original.priceBreaks }]) {
    const result = await mutations.correctQuote(captured, normalizeCorrectQuoteRequest(raw), item, 1, context);
    if (result || await snapshot() !== saved) throw new Error("ACCEPT_QUOTE_STALE_PRICE_BREAK_OR_AUDIT_MUTATION");
  }
  let rejected = false;
  try { await service.correctQuote(customerId, quote.id, correction, context); }
  catch (error) {
    if (!(error instanceof CustomerRelatedServiceError) || error.code !== "CUSTOMER_QUOTE_REVISION_CONFLICT" || error.status !== 409) throw error;
    rejected = true;
  }
  if (!rejected || await snapshot() !== saved) throw new Error("ACCEPT_QUOTE_STALE_SERVICE_CONFLICT");
  // Fail midway through break replacement and at the final master UPDATE.
  // Both must roll back the preceding Audit, DELETE and successful INSERTs.
  const valid = normalizeCorrectQuoteRequest({ ...original, expectedRevision: winner.revision });
  for (const [input, employeeId] of [
    [{ ...valid, priceBreaks: [valid.priceBreaks[0], { ...valid.priceBreaks[1], quantity: -1 }] }, 1],
    [valid, 999999],
  ] as const) {
    let failed = false;
    try { await mutations.correctQuote(winner, input, item, employeeId, context); }
    catch { failed = true; }
    if (!failed || await snapshot() !== saved) throw new Error("ACCEPT_QUOTE_BATCH_ROLLBACK");
  }
  // A newly negotiated price is a separate history record, preserving the first quote.
  const next = await service.createQuote(customerId, { ...original, quoteDate: "2026-10-03" }, context);
  if (next.id === quote.id || next.revision !== 1 || await snapshot() !== saved) throw new Error("ACCEPT_QUOTE_NEW_HISTORY_RETENTION");
  const secondCorrection = await service.correctQuote(customerId, quote.id, { ...original, expectedRevision: winner.revision }, context);
  if (secondCorrection.revision !== winner.revision + 1 || secondCorrection.priceBreaks.length !== 2) throw new Error("ACCEPT_QUOTE_MULTI_BREAK_CORRECTION");
}
