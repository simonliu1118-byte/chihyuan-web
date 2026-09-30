import type {
  CustomerDeletionEligibility,
  CustomerDetail,
  CustomerListResult,
  CustomerSearchQuery,
  CustomerTaxIdCheckResult,
  CustomerTaxIdMatch,
} from "../../shared/customer";
import { FieldValidationError } from "../validation/fields";
import {
  CustomerPersistence,
  type CustomerMutationContext,
} from "./customer-persistence";
import {
  CustomerRepository,
  type CustomerForeignChildIds,
  type CustomerOwnedChildIds,
  type CustomerReferenceErrors,
  type CustomerReferenceIds,
} from "./customer-repository";
import {
  normalizeChangeCustomerNumberRequest,
  normalizeCreateCustomerRequest,
  normalizeDeleteCustomerRequest,
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
  | "CUSTOMER_NUMBER_CHANGE_NOT_ALLOWED"
  | "CUSTOMER_DELETE_NOT_ALLOWED"
  | "CUSTOMER_REFERENCED_DELETE_NOT_ALLOWED"
  | "DUPLICATE_TAX_ID_CONFIRM_REQUIRED";

export class CustomerServiceError extends Error {
  constructor(
    readonly code: CustomerServiceErrorCode,
    readonly status: 403 | 404 | 409 | 422,
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

function ownedChildIds(profile: NormalizedCustomerProfile): CustomerOwnedChildIds {
  return {
    phoneIds: profile.phones.flatMap((row) => row.id == null ? [] : [row.id]),
    contactIds: profile.contacts.flatMap((row) => row.id == null ? [] : [row.id]),
    addressIds: profile.addresses.flatMap((row) => row.id == null ? [] : [row.id]),
    noteIds: profile.notes.flatMap((row) => row.id == null ? [] : [row.id]),
  };
}

function assertReferenceErrors(errors: CustomerReferenceErrors): void {
  if (Object.keys(errors).length > 0) {
    throw new FieldValidationError(errors);
  }
}

function assertOwnedChildren(errors: CustomerForeignChildIds): void {
  const fields: Record<string, string> = {};
  const groups: readonly [string, readonly number[]][] = [
    ["phones", errors.phoneIds],
    ["contacts", errors.contactIds],
    ["addresses", errors.addressIds],
    ["notes", errors.noteIds],
  ];

  for (const [field, ids] of groups) {
    for (const id of ids) {
      fields[`${field}.id.${id}`] = "子資料不存在或不屬於此客戶";
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new FieldValidationError(fields);
  }
}

function normalizeCustomerId(customerId: number): number {
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new FieldValidationError({ customerId: "必須是正整數" });
  }
  return customerId;
}

function isCustomerNumberConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed:\s*customers\.customer_no/i.test(message)
    || /ux_customers_customer_no_present/i.test(message);
}

export class CustomerService {
  private readonly repository: CustomerRepository;
  private readonly persistence: CustomerPersistence;

  constructor(db: D1Database) {
    this.repository = new CustomerRepository(db);
    this.persistence = new CustomerPersistence(db);
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

  async deletionEligibility(customerId: number): Promise<CustomerDeletionEligibility> {
    const id = normalizeCustomerId(customerId);
    const current = await this.repository.getRecordVersion(id);
    if (!current) throw new CustomerServiceError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    const referenced = await this.repository.hasExternalBusinessReferences(id);
    return {
      deletable: !referenced,
      reason: referenced ? "REFERENCED_BUSINESS_HISTORY" : "NEVER_USED",
    };
  }

  async changeCustomerNumber(
    customerId: number,
    raw: unknown,
    context: CustomerMutationContext,
  ): Promise<CustomerDetail> {
    if (context.allowControlledNumberChange !== true) {
      throw new CustomerServiceError(
        "CUSTOMER_NUMBER_CHANGE_NOT_ALLOWED",
        403,
        "Customer number change requires module administration authority",
      );
    }

    const id = normalizeCustomerId(customerId);
    const input = normalizeChangeCustomerNumberRequest(raw);
    const current = await this.repository.getRecordVersion(id);
    if (!current) throw new CustomerServiceError("CUSTOMER_NOT_FOUND", 404, "Customer not found");

    if (current.revision !== input.expectedRevision) {
      throw new CustomerServiceError(
        "CUSTOMER_REVISION_CONFLICT",
        409,
        "Customer has changed since it was loaded",
      );
    }
    if (current.customerNo === input.newCustomerNo) {
      throw new FieldValidationError({ newCustomerNo: "新客戶編號不可與目前編號相同" });
    }
    if (await this.repository.customerNumberExists(input.newCustomerNo, id)) {
      throw new CustomerServiceError("CUSTOMER_NO_CONFLICT", 409, "Customer number already exists");
    }

    let changed: boolean;
    try {
      changed = await this.persistence.changeCustomerNumber(current, input, context);
    } catch (error) {
      if (isCustomerNumberConstraintError(error)) {
        throw new CustomerServiceError("CUSTOMER_NO_CONFLICT", 409, "Customer number already exists");
      }
      throw error;
    }
    if (!changed) {
      throw new CustomerServiceError(
        "CUSTOMER_REVISION_CONFLICT",
        409,
        "Customer has changed since it was loaded",
      );
    }
    return this.getDetail(id);
  }

  async deleteNeverUsed(
    customerId: number,
    raw: unknown,
    context: CustomerMutationContext,
  ): Promise<void> {
    if (context.allowHardDelete !== true) {
      throw new CustomerServiceError(
        "CUSTOMER_DELETE_NOT_ALLOWED",
        403,
        "Customer hard delete requires module administration authority",
      );
    }

    const id = normalizeCustomerId(customerId);
    const input = normalizeDeleteCustomerRequest(raw);
    const current = await this.repository.getRecordVersion(id);
    if (!current) throw new CustomerServiceError("CUSTOMER_NOT_FOUND", 404, "Customer not found");

    if (current.revision !== input.expectedRevision) {
      throw new CustomerServiceError(
        "CUSTOMER_REVISION_CONFLICT",
        409,
        "Customer has changed since it was loaded",
      );
    }
    if (await this.repository.hasExternalBusinessReferences(id)) {
      throw new CustomerServiceError(
        "CUSTOMER_REFERENCED_DELETE_NOT_ALLOWED",
        409,
        "Referenced Customer cannot be hard-deleted",
      );
    }

    const deleted = await this.persistence.deleteNeverUsed(current, context);
    if (deleted) return;

    const latest = await this.repository.getRecordVersion(id);
    if (!latest) return;
    if (await this.repository.hasExternalBusinessReferences(id)) {
      throw new CustomerServiceError(
        "CUSTOMER_REFERENCED_DELETE_NOT_ALLOWED",
        409,
        "Referenced Customer cannot be hard-deleted",
      );
    }
    throw new CustomerServiceError(
      "CUSTOMER_REVISION_CONFLICT",
      409,
      "Customer has changed since it was loaded",
    );
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

  async create(raw: unknown, context: CustomerMutationContext): Promise<CustomerDetail> {
    const input = await this.preflightCreate(raw);
    let customerId: number;
    try {
      customerId = await this.persistence.create(input, context);
    } catch (error) {
      // Preflight gives a friendly conflict in the common case; the D1 unique
      // index remains the final authority if another writer wins the race.
      if (isCustomerNumberConstraintError(error)) {
        throw new CustomerServiceError(
          "CUSTOMER_NO_CONFLICT",
          409,
          "Customer number already exists",
        );
      }
      throw error;
    }
    return this.getDetail(customerId);
  }

  async update(
    customerId: number,
    raw: unknown,
    context: CustomerMutationContext,
  ): Promise<CustomerDetail> {
    const id = normalizeCustomerId(customerId);
    const input = await this.preflightUpdate(id, raw);
    const updated = await this.persistence.update(id, input, context);
    if (!updated) {
      throw new CustomerServiceError(
        "CUSTOMER_REVISION_CONFLICT",
        409,
        "Customer has changed since it was loaded",
      );
    }
    return this.getDetail(id);
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
    assertOwnedChildren(await this.repository.findForeignChildIds(id, ownedChildIds(input)));
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
