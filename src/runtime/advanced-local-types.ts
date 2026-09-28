import type { LocalCustomer } from "./local-database";

export interface LocalCustomerPhone {
  id: number;
  phone: string;
  label: string | null;
  extension: string | null;
  note: string | null;
  isActive: boolean;
}

export interface LocalCustomerContact {
  id: number;
  name: string;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  note: string | null;
  isActive: boolean;
}

export interface LocalCustomerAddress {
  id: number;
  label: string | null;
  postalCode: string | null;
  address: string;
  note: string | null;
  isActive: boolean;
}

export interface LocalCustomerImportantNote {
  id: number;
  content: string;
  isActive: boolean;
}

export interface LocalCustomerVisit {
  id: number;
  customerId: number;
  visitDate: string;
  contactId: number | null;
  contactNameSnapshot: string | null;
  contactText: string | null;
  content: string;
  operatorName: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalCustomerQuoteTier {
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface LocalCustomerQuote {
  id: number;
  customerId: number;
  itemId: number;
  quoteDate: string;
  operatorName: string;
  tiers: LocalCustomerQuoteTier[];
  note: string | null;
  correctedFromId: number | null;
  revision: number;
  createdAt: string;
}

export interface LocalCustomerFrequentItem {
  id: number;
  customerId: number;
  itemId: number | null;
  freeText: string | null;
  note: string | null;
  createdAt: string;
}

export interface LocalItemNumberHistory {
  id: number;
  itemNo: string;
  validFrom: string;
  validTo: string | null;
  changeSource: string | null;
  isSearchable: boolean;
  createdAt: string;
}

export type LocalItemCostTaxMode = "none" | "inclusive" | "exclusive";

export type LocalDefectStatus = "created" | "processing" | "resolved";

export interface LocalDefect {
  id: number;
  ref: string;
  reportedDate: string;
  customerId: number;
  customerNameSnapshot: string;
  itemId: number;
  itemNoSnapshot: string;
  itemNameSnapshot: string;
  ownerName: string;
  defectDescription: string;
  handlingNote: string | null;
  handledAt: string | null;
  status: LocalDefectStatus;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

declare module "./local-database" {
  interface LocalCustomer {
    region?: string | null;
    phones?: LocalCustomerPhone[];
    contacts?: LocalCustomerContact[];
    addresses?: LocalCustomerAddress[];
    importantNotes?: LocalCustomerImportantNote[];
  }

  interface LocalItem {
    cost?: number | null;
    costTaxMode?: LocalItemCostTaxMode | null;
    storePrice?: number | null;
    clinicPrice?: number | null;
    notes?: string | null;
    numberHistory?: LocalItemNumberHistory[];
  }

  interface LocalDatabase {
    customerVisits?: LocalCustomerVisit[];
    customerQuotes?: LocalCustomerQuote[];
    customerFrequentItems?: LocalCustomerFrequentItem[];
    defects?: LocalDefect[];
  }
}

export function customerPhones(customer: LocalCustomer): LocalCustomerPhone[] {
  if (customer.phones?.length) return customer.phones;
  return customer.phone
    ? [{ id: customer.id * 1000 + 1, phone: customer.phone, label: "主要", extension: null, note: null, isActive: true }]
    : [];
}

export function customerContacts(customer: LocalCustomer): LocalCustomerContact[] {
  if (customer.contacts?.length) return customer.contacts;
  return customer.contact
    ? [{ id: customer.id * 1000 + 2, name: customer.contact, title: null, phone: customer.phone, mobile: null, note: null, isActive: true }]
    : [];
}

export function customerAddresses(customer: LocalCustomer): LocalCustomerAddress[] {
  if (customer.addresses?.length) return customer.addresses;
  return customer.address
    ? [{ id: customer.id * 1000 + 3, label: "主要", postalCode: null, address: customer.address, note: null, isActive: true }]
    : [];
}

export function customerImportantNotes(customer: LocalCustomer): LocalCustomerImportantNote[] {
  if (customer.importantNotes?.length) return customer.importantNotes;
  return customer.note
    ? [{ id: customer.id * 1000 + 4, content: customer.note, isActive: true }]
    : [];
}
