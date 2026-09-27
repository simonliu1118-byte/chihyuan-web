import type {
  ContractorDetail,
  ContractorListResult,
  ContractorSearchQuery,
} from "../../shared/contractor-outsourcing";
import { FieldValidationError } from "../validation/fields";
import { ContractorPersistence, type ContractorMutationContext } from "./contractor-persistence";
import { ContractorRepository } from "./contractor-repository";
import {
  normalizeContractorPriceRequest,
  normalizeCreateContractorRequest,
  normalizeUpdateContractorRequest,
} from "./contractor-validation";

export type ContractorServiceErrorCode =
  | "CONTRACTOR_NOT_FOUND"
  | "CONTRACTOR_REVISION_CONFLICT"
  | "CONTRACTOR_CONTACT_OWNERSHIP_INVALID"
  | "CONTRACTOR_PRICE_CONFLICT"
  | "CONTRACTOR_PRICE_REVISION_REQUIRED"
  | "CONTRACTOR_PRICE_REVISION_CONFLICT"
  | "CONTRACTOR_PRICE_UNIT_INVALID"
  | "CONTRACTOR_DELETE_NOT_ALLOWED";

export class ContractorServiceError extends Error {
  constructor(
    readonly code: ContractorServiceErrorCode,
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "ContractorServiceError";
  }
}

function normalizeId(id: number, field = "contractorId"): number {
  if (!Number.isInteger(id) || id <= 0) throw new FieldValidationError({ [field]: "必須是正整數" });
  return id;
}

export class ContractorService {
  private readonly repository: ContractorRepository;
  private readonly persistence: ContractorPersistence;

  constructor(db: D1Database) {
    this.repository = new ContractorRepository(db);
    this.persistence = new ContractorPersistence(db);
  }

  async search(query: ContractorSearchQuery): Promise<ContractorListResult> {
    return this.repository.search(query);
  }

  async getDetail(contractorId: number): Promise<ContractorDetail> {
    const id = normalizeId(contractorId);
    const detail = await this.repository.getDetail(id);
    if (!detail) throw new ContractorServiceError("CONTRACTOR_NOT_FOUND", 404, "Contractor not found");
    return detail;
  }

  async create(raw: unknown, context: ContractorMutationContext): Promise<ContractorDetail> {
    const input = normalizeCreateContractorRequest(raw);
    if (input.contacts.some((contact) => contact.id != null)) {
      throw new ContractorServiceError("CONTRACTOR_CONTACT_OWNERSHIP_INVALID", 422, "New Contractor contacts cannot carry existing IDs");
    }
    const id = await this.persistence.create(input, context);
    return this.getDetail(id);
  }

  async update(contractorId: number, raw: unknown, context: ContractorMutationContext): Promise<ContractorDetail> {
    const id = normalizeId(contractorId);
    const input = normalizeUpdateContractorRequest(raw);
    const state = await this.repository.getRecordState(id);
    if (!state) throw new ContractorServiceError("CONTRACTOR_NOT_FOUND", 404, "Contractor not found");
    if (state.revision !== input.expectedRevision) this.throwRevisionConflict();

    const suppliedIds = input.contacts.map((contact) => contact.id).filter((value): value is number => value != null);
    if (suppliedIds.length > 0) {
      const existing = await this.repository.existingContactIds(id);
      if (suppliedIds.some((contactId) => !existing.has(contactId))) {
        throw new ContractorServiceError(
          "CONTRACTOR_CONTACT_OWNERSHIP_INVALID",
          422,
          "Contractor contact does not belong to this Contractor",
        );
      }
    }

    const updated = await this.persistence.update(id, input, context);
    if (!updated) this.throwRevisionConflict();
    return this.getDetail(id);
  }

  async setCurrentPrice(contractorId: number, raw: unknown, context: ContractorMutationContext): Promise<ContractorDetail> {
    const id = normalizeId(contractorId);
    const state = await this.repository.getRecordState(id);
    if (!state) throw new ContractorServiceError("CONTRACTOR_NOT_FOUND", 404, "Contractor not found");
    const input = normalizeContractorPriceRequest(raw);
    const item = await this.repository.resolvePricingItem(input.itemId);
    if (!item) throw new FieldValidationError({ itemId: "商品不存在" });
    if (!item.allowedUnits.has(input.pricingUnit)) {
      throw new ContractorServiceError(
        "CONTRACTOR_PRICE_UNIT_INVALID",
        422,
        `計價單位必須是 ${[...item.allowedUnits].join(" / ")}`,
      );
    }

    const current = await this.repository.getCurrentPrice(id, input.itemId);
    if (!current) {
      if (input.expectedRevision != null) {
        throw new ContractorServiceError("CONTRACTOR_PRICE_CONFLICT", 409, "Contractor Price no longer exists in the expected state");
      }
      const created = await this.persistence.createPrice(id, input, context);
      if (!created) throw new ContractorServiceError("CONTRACTOR_PRICE_CONFLICT", 409, "Contractor Price already exists");
    } else {
      if (input.expectedRevision == null) {
        throw new ContractorServiceError("CONTRACTOR_PRICE_REVISION_REQUIRED", 409, "Current Contractor Price revision is required for update");
      }
      if (input.expectedRevision !== current.revision) {
        throw new ContractorServiceError("CONTRACTOR_PRICE_REVISION_CONFLICT", 409, "Contractor Price has changed since it was loaded");
      }
      const updated = await this.persistence.updatePrice(id, current, input, context);
      if (!updated) throw new ContractorServiceError("CONTRACTOR_PRICE_REVISION_CONFLICT", 409, "Contractor Price has changed since it was loaded");
    }
    return this.getDetail(id);
  }

  async deleteNeverUsed(
    contractorId: number,
    expectedRevision: number,
    context: ContractorMutationContext,
    allowHardDelete: boolean,
  ): Promise<void> {
    const id = normalizeId(contractorId);
    if (!Number.isInteger(expectedRevision) || expectedRevision <= 0) throw new FieldValidationError({ expectedRevision: "必須是正整數" });
    if (!allowHardDelete) throw new ContractorServiceError("CONTRACTOR_DELETE_NOT_ALLOWED", 403, "Contractor hard-delete permission is required");
    const state = await this.repository.getRecordState(id);
    if (!state) throw new ContractorServiceError("CONTRACTOR_NOT_FOUND", 404, "Contractor not found");
    if (state.revision !== expectedRevision) this.throwRevisionConflict();
    if (await this.repository.hasBusinessUse(id)) {
      throw new ContractorServiceError("CONTRACTOR_DELETE_NOT_ALLOWED", 409, "Referenced Contractor must be retained and may be deactivated instead");
    }
    const deleted = await this.persistence.deleteNeverUsed(state, context);
    if (!deleted) this.throwRevisionConflict();
  }

  private throwRevisionConflict(): never {
    throw new ContractorServiceError("CONTRACTOR_REVISION_CONFLICT", 409, "Contractor has changed since it was loaded");
  }
}
