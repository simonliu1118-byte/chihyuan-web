import type {
  CustomerFrequentItemRecord,
  CustomerItemQuoteDetail,
  CustomerItemQuoteSummary,
  CustomerRelatedPage,
  CustomerRelatedQuery,
  CustomerVisitRecord,
} from "../../shared/customer-related";
import { FieldValidationError } from "../validation/fields";
import {
  CustomerRelatedMutationRepository,
  type ActiveItemSnapshot,
  type CustomerRelatedMutationContext,
} from "./customer-related-mutation-repository";
import { CustomerRelatedMutationLookups } from "./customer-related-mutation-lookups";
import { CustomerRelatedRepository } from "./customer-related-repository";
import {
  normalizeCorrectQuoteRequest,
  normalizeCreateFrequentItemRequest,
  normalizeCreateQuoteRequest,
  normalizeCreateVisitRequest,
  normalizeDeleteFrequentItemRequest,
  normalizeDeleteVisitRequest,
  normalizeUpdateFrequentItemRequest,
  normalizeUpdateVisitRequest,
} from "./customer-related-validation";
import { CustomerRepository } from "./customer-repository";

export type CustomerRelatedServiceErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_VISIT_NOT_FOUND"
  | "CUSTOMER_VISIT_REVISION_CONFLICT"
  | "CUSTOMER_FREQUENT_ITEM_NOT_FOUND"
  | "CUSTOMER_FREQUENT_ITEM_CONFLICT"
  | "CUSTOMER_QUOTE_NOT_FOUND"
  | "CUSTOMER_QUOTE_REVISION_CONFLICT";

export class CustomerRelatedServiceError extends Error {
  constructor(
    readonly code: CustomerRelatedServiceErrorCode,
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "CustomerRelatedServiceError";
  }
}

function positiveId(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new FieldValidationError({ [field]: "必須是正整數" });
  }
  return value;
}

export class CustomerRelatedService {
  private readonly customers: CustomerRepository;
  private readonly related: CustomerRelatedRepository;
  private readonly mutations: CustomerRelatedMutationRepository;
  private readonly mutationLookups: CustomerRelatedMutationLookups;

  constructor(db: D1Database) {
    this.customers = new CustomerRepository(db);
    this.related = new CustomerRelatedRepository(db);
    this.mutations = new CustomerRelatedMutationRepository(db);
    this.mutationLookups = new CustomerRelatedMutationLookups(db);
  }

  async listVisits(
    customerId: number,
    query: CustomerRelatedQuery = {},
  ): Promise<CustomerRelatedPage<CustomerVisitRecord>> {
    const id = await this.requireCustomer(customerId);
    return this.related.listVisits(id, query);
  }

  async listFrequentItems(
    customerId: number,
    limit = 100,
  ): Promise<readonly CustomerFrequentItemRecord[]> {
    const id = await this.requireCustomer(customerId);
    return this.related.listFrequentItems(id, limit);
  }

  async listQuotes(
    customerId: number,
    query: CustomerRelatedQuery = {},
  ): Promise<CustomerRelatedPage<CustomerItemQuoteSummary>> {
    const id = await this.requireCustomer(customerId);
    return this.related.listQuotes(id, query);
  }

  async getQuoteDetail(customerId: number, quoteId: number): Promise<CustomerItemQuoteDetail> {
    const customer = await this.requireCustomer(customerId);
    return this.requireQuote(customer, quoteId);
  }

  async createVisit(
    customerId: number,
    raw: unknown,
    context: CustomerRelatedMutationContext,
  ): Promise<CustomerVisitRecord> {
    const customer = await this.requireCustomer(customerId);
    const input = normalizeCreateVisitRequest(raw);
    const employeeId = await this.resolveEmployee(input.employeeId, context, null);
    const personSnapshot = await this.resolveVisitPerson(customer, input.contactId, input.personSnapshot, null);
    const visitId = await this.mutations.createVisit(customer, input, employeeId, personSnapshot, context);
    const created = await this.mutationLookups.getVisit(customer, visitId);
    if (!created) throw new Error("CUSTOMER_VISIT_CREATE_READBACK_FAILED");
    return created;
  }

  async updateVisit(
    customerId: number,
    visitId: number,
    raw: unknown,
    context: CustomerRelatedMutationContext,
  ): Promise<CustomerVisitRecord> {
    const customer = await this.requireCustomer(customerId);
    const id = positiveId(visitId, "visitId");
    const input = normalizeUpdateVisitRequest(raw);
    const current = await this.mutationLookups.getVisit(customer, id);
    if (!current) {
      throw new CustomerRelatedServiceError("CUSTOMER_VISIT_NOT_FOUND", 404, "Customer visit not found");
    }
    if (current.revision !== input.expectedRevision) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_VISIT_REVISION_CONFLICT",
        409,
        "Customer visit changed since it was loaded",
      );
    }

    const employeeId = await this.resolveEmployee(input.employeeId, context, current.employee.id);
    const personSnapshot = await this.resolveVisitPerson(
      customer,
      input.contactId,
      input.personSnapshot,
      current,
    );
    const updated = await this.mutations.updateVisit(
      customer,
      id,
      input,
      employeeId,
      personSnapshot,
      context,
    );
    if (!updated) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_VISIT_REVISION_CONFLICT",
        409,
        "Customer visit changed while saving",
      );
    }
    const saved = await this.mutationLookups.getVisit(customer, id);
    if (!saved) throw new Error("CUSTOMER_VISIT_UPDATE_READBACK_FAILED");
    return saved;
  }

  async deleteVisit(
    customerId: number,
    visitId: number,
    raw: unknown,
    context: CustomerRelatedMutationContext,
  ): Promise<void> {
    const customer = await this.requireCustomer(customerId);
    const id = positiveId(visitId, "visitId");
    const input = normalizeDeleteVisitRequest(raw);
    const current = await this.mutationLookups.getVisit(customer, id);
    if (!current) {
      throw new CustomerRelatedServiceError("CUSTOMER_VISIT_NOT_FOUND", 404, "Customer visit not found");
    }
    if (current.revision !== input.expectedRevision) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_VISIT_REVISION_CONFLICT",
        409,
        "Customer visit changed since it was loaded",
      );
    }
    const removed = await this.mutations.deleteVisit(current, input.expectedRevision, context);
    if (!removed) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_VISIT_REVISION_CONFLICT",
        409,
        "Customer visit changed while deleting",
      );
    }
  }

  async createFrequentItem(
    customerId: number,
    raw: unknown,
    context: CustomerRelatedMutationContext,
  ): Promise<number> {
    const customer = await this.requireCustomer(customerId);
    const input = normalizeCreateFrequentItemRequest(raw);
    if (input.itemId != null) await this.requireActiveItem(input.itemId);
    return this.mutations.createFrequentItem(customer, input, context);
  }

  async updateFrequentItem(
    customerId: number,
    frequentId: number,
    raw: unknown,
    context: CustomerRelatedMutationContext,
  ): Promise<void> {
    const customer = await this.requireCustomer(customerId);
    const id = positiveId(frequentId, "frequentItemId");
    const input = normalizeUpdateFrequentItemRequest(raw);
    const current = await this.mutationLookups.getFrequentItemVersion(customer, id);
    if (!current) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_FREQUENT_ITEM_NOT_FOUND",
        404,
        "Customer frequent item not found",
      );
    }
    if (current.updatedAt !== input.expectedUpdatedAt) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_FREQUENT_ITEM_CONFLICT",
        409,
        "Customer frequent item changed since it was loaded",
      );
    }
    if (input.itemId != null && input.itemId !== current.itemId) {
      await this.requireActiveItem(input.itemId);
    }
    const updated = await this.mutations.updateFrequentItem(customer, id, input, context);
    if (!updated) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_FREQUENT_ITEM_CONFLICT",
        409,
        "Customer frequent item changed while saving",
      );
    }
  }

  async deleteFrequentItem(
    customerId: number,
    frequentId: number,
    raw: unknown,
  ): Promise<void> {
    const customer = await this.requireCustomer(customerId);
    const id = positiveId(frequentId, "frequentItemId");
    const input = normalizeDeleteFrequentItemRequest(raw);
    const current = await this.mutationLookups.getFrequentItemVersion(customer, id);
    if (!current) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_FREQUENT_ITEM_NOT_FOUND",
        404,
        "Customer frequent item not found",
      );
    }
    if (current.updatedAt !== input.expectedUpdatedAt) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_FREQUENT_ITEM_CONFLICT",
        409,
        "Customer frequent item changed since it was loaded",
      );
    }
    const removed = await this.mutations.deleteFrequentItem(customer, id, input.expectedUpdatedAt);
    if (!removed) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_FREQUENT_ITEM_CONFLICT",
        409,
        "Customer frequent item changed while deleting",
      );
    }
  }

  async createQuote(
    customerId: number,
    raw: unknown,
    context: CustomerRelatedMutationContext,
  ): Promise<CustomerItemQuoteDetail> {
    const customer = await this.requireCustomer(customerId);
    const input = normalizeCreateQuoteRequest(raw);
    const item = await this.requireActiveItem(input.itemId);
    const employeeId = await this.resolveEmployee(input.employeeId, context, null);
    const quoteId = await this.mutations.createQuote(customer, input, item, employeeId, context);
    return this.requireQuote(customer, quoteId);
  }

  async correctQuote(
    customerId: number,
    quoteId: number,
    raw: unknown,
    context: CustomerRelatedMutationContext,
  ): Promise<CustomerItemQuoteDetail> {
    const customer = await this.requireCustomer(customerId);
    const id = positiveId(quoteId, "quoteId");
    const input = normalizeCorrectQuoteRequest(raw);
    const current = await this.requireQuote(customer, id);
    if (current.revision !== input.expectedRevision) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_QUOTE_REVISION_CONFLICT",
        409,
        "Customer quote changed since it was loaded",
      );
    }

    const item: ActiveItemSnapshot = input.itemId === current.itemId
      ? {
          id: current.itemId,
          itemNo: current.itemNoSnapshot,
          name: current.itemNameSnapshot,
          spec: current.specSnapshot,
        }
      : await this.requireActiveItem(input.itemId);
    const employeeId = await this.resolveEmployee(input.employeeId, context, current.employee.id);
    const corrected = await this.mutations.correctQuote(current, input, item, employeeId, context);
    if (!corrected) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_QUOTE_REVISION_CONFLICT",
        409,
        "Customer quote changed while correcting",
      );
    }
    return this.requireQuote(customer, id);
  }

  private async requireCustomer(customerId: number): Promise<number> {
    const id = positiveId(customerId, "customerId");
    const current = await this.customers.getRecordVersion(id);
    if (!current) {
      throw new CustomerRelatedServiceError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }
    return id;
  }

  private async requireQuote(customerId: number, quoteId: number): Promise<CustomerItemQuoteDetail> {
    const id = positiveId(quoteId, "quoteId");
    const quote = await this.related.getQuoteDetail(customerId, id);
    if (!quote) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_QUOTE_NOT_FOUND",
        404,
        "Customer quote not found",
      );
    }
    return quote;
  }

  private async requireActiveItem(itemId: number): Promise<ActiveItemSnapshot> {
    const item = await this.mutations.activeItemSnapshot(itemId);
    if (!item) {
      throw new FieldValidationError({ itemId: "商品不存在或已停用" });
    }
    return item;
  }

  private async resolveEmployee(
    requestedEmployeeId: number | null,
    context: CustomerRelatedMutationContext,
    currentEmployeeId: number | null,
  ): Promise<number> {
    const candidate = requestedEmployeeId ?? currentEmployeeId ?? context.actorMemberId;
    if (currentEmployeeId != null && candidate === currentEmployeeId) return candidate;
    if (!await this.mutations.activeEmployeeExists(candidate)) {
      throw new FieldValidationError({ employeeId: "負責人員不存在或已停用" });
    }
    return candidate;
  }

  private async resolveVisitPerson(
    customerId: number,
    contactId: number | null,
    requestedSnapshot: string | null,
    current: CustomerVisitRecord | null,
  ): Promise<string | null> {
    if (contactId == null) return requestedSnapshot;

    if (current && current.contactId === contactId) {
      return requestedSnapshot ?? current.personSnapshot;
    }

    const contactName = await this.mutations.activeContactName(customerId, contactId);
    if (!contactName) {
      throw new FieldValidationError({
        contactId: "聯絡人不存在、已停用或不屬於此客戶",
      });
    }
    return requestedSnapshot ?? contactName;
  }
}
