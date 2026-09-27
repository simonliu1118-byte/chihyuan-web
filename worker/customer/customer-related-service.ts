import type {
  CustomerFrequentItemRecord,
  CustomerItemQuoteDetail,
  CustomerItemQuoteSummary,
  CustomerRelatedPage,
  CustomerRelatedQuery,
  CustomerVisitRecord,
} from "../../shared/customer-related";
import { FieldValidationError } from "../validation/fields";
import { CustomerRelatedRepository } from "./customer-related-repository";
import { CustomerRepository } from "./customer-repository";

export type CustomerRelatedServiceErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_QUOTE_NOT_FOUND";

export class CustomerRelatedServiceError extends Error {
  constructor(
    readonly code: CustomerRelatedServiceErrorCode,
    readonly status: 404,
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

  constructor(db: D1Database) {
    this.customers = new CustomerRepository(db);
    this.related = new CustomerRelatedRepository(db);
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
    const quote = await this.related.getQuoteDetail(customer, positiveId(quoteId, "quoteId"));
    if (!quote) {
      throw new CustomerRelatedServiceError(
        "CUSTOMER_QUOTE_NOT_FOUND",
        404,
        "Customer quote not found",
      );
    }
    return quote;
  }

  private async requireCustomer(customerId: number): Promise<number> {
    const id = positiveId(customerId, "customerId");
    const current = await this.customers.getRecordVersion(id);
    if (!current) {
      throw new CustomerRelatedServiceError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }
    return id;
  }
}
