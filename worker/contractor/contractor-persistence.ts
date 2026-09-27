import { AuditService } from "../audit/audit-service";
import type {
  NormalizedContractorPriceRequest,
  NormalizedContractorProfile,
  NormalizedUpdateContractorRequest,
} from "./contractor-validation";
import type { ContractorRecordState } from "./contractor-repository";

export interface ContractorMutationContext {
  actorMemberId: number;
  now: string;
  requestId?: string | null;
}

function assertContext(context: ContractorMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) throw new Error("CONTRACTOR_MUTATION_ACTOR_REQUIRED");
  if (!context.now || Number.isNaN(Date.parse(context.now))) throw new Error("CONTRACTOR_MUTATION_TIMESTAMP_REQUIRED");
}

function contactInsert(
  db: D1Database,
  contractorIdSql: string,
  contractorIdValues: readonly (number | string)[],
  contact: NormalizedContractorProfile["contacts"][number],
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO contractor_contacts (
      contractor_id, name, title, phone, mobile, note, sort_order, is_active
    ) SELECT ${contractorIdSql}, ?${contractorIdValues.length + 1}, ?${contractorIdValues.length + 2},
             ?${contractorIdValues.length + 3}, ?${contractorIdValues.length + 4}, ?${contractorIdValues.length + 5},
             ?${contractorIdValues.length + 6}, ?${contractorIdValues.length + 7}
  `).bind(
    ...contractorIdValues,
    contact.name,
    contact.title,
    contact.phone,
    contact.mobile,
    contact.note,
    contact.sortOrder,
    contact.isActive ? 1 : 0,
  );
}

export class ContractorPersistence {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) {
    this.audit = new AuditService(db);
  }

  async create(input: NormalizedContractorProfile, context: ContractorMutationContext): Promise<number> {
    assertContext(context);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO contractors (
          entity_type, display_name, legal_name, tax_id, phone, address, note, is_active,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?9,?10,1)
      `).bind(
        input.entityType, input.displayName, input.legalName, input.taxId, input.phone,
        input.address, input.note, input.isActive ? 1 : 0, context.now, context.actorMemberId,
      ),
    ];
    input.contacts.forEach((contact) => {
      statements.push(contactInsert(this.db, "(SELECT MAX(id) FROM contractors)", [], contact));
    });
    statements.push(this.db.prepare("SELECT MAX(id) AS contractor_id FROM contractors"));
    const results = await this.db.batch(statements);
    const row = results[results.length - 1]?.results?.[0] as { contractor_id?: number } | undefined;
    const id = Number(row?.contractor_id ?? 0);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("CONTRACTOR_CREATE_ID_UNAVAILABLE");
    return id;
  }

  async update(contractorId: number, input: NormalizedUpdateContractorRequest, context: ContractorMutationContext): Promise<boolean> {
    assertContext(context);
    const revisionGate = "EXISTS (SELECT 1 FROM contractors WHERE id = ? AND revision = ?)";
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`DELETE FROM contractor_contacts WHERE contractor_id = ?1 AND ${revisionGate}`).bind(
        contractorId, contractorId, input.expectedRevision,
      ),
    ];
    input.contacts.forEach((contact) => {
      statements.push(this.db.prepare(`
        INSERT INTO contractor_contacts (
          contractor_id, name, title, phone, mobile, note, sort_order, is_active
        ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
          WHERE ${revisionGate}
      `).bind(
        contractorId, contact.name, contact.title, contact.phone, contact.mobile, contact.note,
        contact.sortOrder, contact.isActive ? 1 : 0, contractorId, input.expectedRevision,
      ));
    });
    statements.push(this.db.prepare(`
      UPDATE contractors
         SET entity_type=?1, display_name=?2, legal_name=?3, tax_id=?4, phone=?5,
             address=?6, note=?7, is_active=?8, updated_at=?9, updated_by=?10,
             revision=revision+1
       WHERE id=?11 AND revision=?12
    `).bind(
      input.entityType, input.displayName, input.legalName, input.taxId, input.phone,
      input.address, input.note, input.isActive ? 1 : 0, context.now, context.actorMemberId,
      contractorId, input.expectedRevision,
    ));
    const results = await this.db.batch(statements);
    return Number(results[results.length - 1]?.meta?.changes ?? 0) === 1;
  }

  async createPrice(
    contractorId: number,
    input: NormalizedContractorPriceRequest,
    context: ContractorMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT INTO contractor_pricing (
          contractor_id,item_id,pricing_unit,unit_price,note,updated_at,updated_by,revision
        ) SELECT ?1,?2,?3,?4,?5,?6,?7,1
          WHERE EXISTS (SELECT 1 FROM contractors WHERE id=?1)
            AND NOT EXISTS (SELECT 1 FROM contractor_pricing WHERE contractor_id=?1 AND item_id=?2)
      `).bind(contractorId, input.itemId, input.pricingUnit, input.unitPriceScaled4, input.note, context.now, context.actorMemberId),
      this.audit.prepareRecord({
        entityType: "contractor_price",
        entityKey: `${contractorId}:${input.itemId}`,
        action: "contractor_price.created",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        after: { pricingUnit: input.pricingUnit, unitPriceScaled4: input.unitPriceScaled4 },
      }, {
        sql: "EXISTS (SELECT 1 FROM contractor_pricing WHERE contractor_id=? AND item_id=? AND revision=1 AND updated_at=?)",
        values: [contractorId, input.itemId, context.now],
      }),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  async updatePrice(
    contractorId: number,
    current: { revision: number; pricingUnit: string; unitPriceScaled4: number; note: string | null },
    input: NormalizedContractorPriceRequest,
    context: ContractorMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const nextRevision = current.revision + 1;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE contractor_pricing
           SET pricing_unit=?1, unit_price=?2, note=?3, updated_at=?4, updated_by=?5,
               revision=revision+1
         WHERE contractor_id=?6 AND item_id=?7 AND revision=?8
      `).bind(
        input.pricingUnit, input.unitPriceScaled4, input.note, context.now, context.actorMemberId,
        contractorId, input.itemId, current.revision,
      ),
      this.audit.prepareRecord({
        entityType: "contractor_price",
        entityKey: `${contractorId}:${input.itemId}`,
        action: "contractor_price.changed",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        before: { pricingUnit: current.pricingUnit, unitPriceScaled4: current.unitPriceScaled4, note: current.note },
        after: { pricingUnit: input.pricingUnit, unitPriceScaled4: input.unitPriceScaled4, note: input.note },
      }, {
        sql: "EXISTS (SELECT 1 FROM contractor_pricing WHERE contractor_id=? AND item_id=? AND revision=?)",
        values: [contractorId, input.itemId, nextRevision],
      }),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  async deleteNeverUsed(state: ContractorRecordState, context: ContractorMutationContext): Promise<boolean> {
    assertContext(context);
    const results = await this.db.batch([
      this.audit.prepareRecord({
        entityType: "contractor",
        entityKey: String(state.id),
        action: "contractor.deleted",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        before: { displayName: state.displayName, revision: state.revision },
      }, {
        sql: "EXISTS (SELECT 1 FROM contractors WHERE id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM outsourcing_orders WHERE contractor_id=?))",
        values: [state.id, state.revision, state.id],
      }),
      this.db.prepare("DELETE FROM contractor_pricing WHERE contractor_id=?1 AND EXISTS (SELECT 1 FROM contractors WHERE id=?1 AND revision=?2 AND NOT EXISTS (SELECT 1 FROM outsourcing_orders WHERE contractor_id=?1))").bind(state.id, state.revision),
      this.db.prepare("DELETE FROM contractor_contacts WHERE contractor_id=?1 AND EXISTS (SELECT 1 FROM contractors WHERE id=?1 AND revision=?2 AND NOT EXISTS (SELECT 1 FROM outsourcing_orders WHERE contractor_id=?1))").bind(state.id, state.revision),
      this.db.prepare("DELETE FROM contractors WHERE id=?1 AND revision=?2 AND NOT EXISTS (SELECT 1 FROM outsourcing_orders WHERE contractor_id=?1)").bind(state.id, state.revision),
    ]);
    return Number(results[3]?.meta?.changes ?? 0) === 1;
  }
}
