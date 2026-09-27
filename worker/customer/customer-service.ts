import type {
  CustomerDetail,
  CustomerListResult,
  CustomerSearchQuery,
  CustomerTaxIdCheckResult,
  CustomerTaxIdMatch,
} from "../../shared/customer";
import { FieldValidationError } from "../validation/fields";
import {
  CustomerRepository,
  type CustomerReferenceErrors,
  type CustomerReferenceIds,
} from "./customer-repository";
import {
  normalizeCreateCustomerRequest,
  normalizeUpdateCustomerRequest,
  type NormalizedCreateCustomerRequest,
  type NormalizedCustomerProfile,
  type NormalizedUpdateCustomerRequest,
} from "./customer-validation";

export type CustomerServiceErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_REVISION_CONFLICT"
  | "CUSTOMER_NO_CONFLICT"
  | "CUSTOMER_NO_CONTROLLED_ACTION_REQUIRED"
  | "DUPLICATE_TAX_ID_CONFIRM_REQUIRED";

export class CustomerServiceError extends Error {
  constructor(
    readonly code: CustomerServiceErrorCode,
    readonly status: 404 | 409 | 422,
    message: string,
    readonly matches: readonly CustomerTaxIdMatch[] = [],
  ) {
    super(message);
    this.name = "CustomerServiceError";
  }
}

function referenceIds(profile: NormalizedCustomerProfile): CustomerReferenceIds {
  return {
    customerCategoryId: profile.customerCategoryId,
    customerStatusId: profile.customerStatusId,
    regionId: profile.regionId,
    ownerDepartmentId: profile.ownerDepartmentId,
    ownerEmployeeId: profile.ownerEmployeeId,
  };
}

function assertReferenceErrors(errors: CustomerReferenceErrors): void {
  if (Object.keys(errors).length > 0) {
    throw new FieldValidationError(errors);
  }
}

function normalizeCustomerId(customerId: number): number {
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new FieldValidationError({ customerId: "必須是正整數" });
  }
  return customerId;
}

export class CustomerService {
  private readonly repository: CustomerRepository;

  constructor(db: D1Database) {
    this.repository = new CustomerRepository(db);
  }

  async search(query: CustomerSearchQuery): Promise<CustomerListResult> {
    return this.repository.search(query);
  }

  async getDetail(customerId: number): Promise<CustomerDetail> {
    const id = normalizeCustomerId(customerId);
    const customer = await this.repository.getDetail(id);
    if (!customer) {
      throw new CustomerServiceError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }
    return customer;
  }

  async checkTaxId(
    taxId: string | null | undefined,
    excludeCustomerId: number | null = null,
  ): Promise<CustomerTaxIdCheckResult> {
    const normalized = taxId?.trim() ?? "";
    if (!normalized) {
      return { taxId: null, matches: [], requiresConfirmation: false };
    }
    if (!/^\d{8}$/.test(normalized)) {
      throw new FieldValidationError({ taxId: "統一編號需為 8 碼數字" });
    }

    const matches = await this.repository.findTaxIdMatches(normalized, excludeCustomerId, 10);
    return {
      taxId: normalized,
      matches,
      requiresConfirmation: matches.length > 0,
    };
  }

  async preflightCreate(raw: unknown): Promise<NormalizedCreateCustomerRequest> {
    const input = normalizeCreateCustomerRequest(raw);
    await this.assertReferences(input);
    this.assertNoCreateChildIds(input);

    if (input.customerNo && await this.repository.customerNumberExists(input.customerNo)) {
      throw new CustomerServiceError(
        "CUSTOMER_NO_CONFLICT",
        409,
        "Customer number already exists",
      );
    }

    await this.assertDuplicateTaxIdAcknowledged(input, null);
    return input;
  }

  async preflightUpdate(
    customerId: number,
    raw: unknown,
  ): Promise<NormalizedUpdateCustomerRequest> {
    const id = normalizeCustomerId(customerId);
    const input = normalizeUpdateCustomerRequest(raw);
    const current = await this.repository.getRecordVersion(id);
    if (!current) {
      throw new CustomerServiceError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    if (current.revision !== input.expectedRevision) {
      throw new CustomerServiceError(
        "CUSTOMER_REVISION_CONFLICT",
        409,
        "Customer has changed since it was loaded",
      );
    }

    if (current.customerNo !== input.customerNo) {
      throw new CustomerServiceError(
        "CUSTOMER_NO_CONTROLLED_ACTION_REQUIRED",
        409,
        "Customer number assignment or correction requires the controlled Customer-number action",
      );
    }

    await this.assertReferences(input);
    await this.assertDuplicateTaxIdAcknowledged(input, id);
    return input;
  }

  private async assertReferences(profile: NormalizedCustomerProfile): Promise<void> {
    const errors = await this.repository.validateReferences(referenceIds(profile));
    assertReferenceErrors(errors);
  }

  private assertNoCreateChildIds(profile: NormalizedCustomerProfile): void {
    const errors: Record<string, string> = {};
    const groups: readonly [string, readonly { id?: number }[]][] = [
      ["phones", profile.phones],
      ["contacts", profile.contacts],
      ["addresses", profile.addresses],
      ["notes", profile.notes],
    ];
    for (const [field, rows] of groups) {
      rows.forEach((row, index) => {
        if (row.id != null) errors[`${field}.${index}.id`] = "新增客戶不可指定既有子資料 ID";
      });
    }
    if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  }

  private async assertDuplicateTaxIdAcknowledged(
    profile: NormalizedCustomerProfile,
    excludeCustomerId: number | null,
  ): Promise<void> {
    if (!profile.taxId) return;
    const matches = await this.repository.findTaxIdMatches(profile.taxId, excludeCustomerId, 10);
    if (matches.length === 0 || profile.confirmDuplicateTaxId) return;

    throw new CustomerServiceError(
      "DUPLICATE_TAX_ID_CONFIRM_REQUIRED",
      422,
      "Duplicate Tax ID requires explicit confirmation",
      matches,
    );
  }
}
