import type { LookupSetting } from "./settings";

export interface BusinessActorRef {
  appMemberId: number;
  employeeNo: string | null;
  displayName: string;
}

export interface CustomerModuleLookups {
  actor: BusinessActorRef;
  departments: readonly LookupSetting[];
  customerCategories: readonly LookupSetting[];
  customerStatuses: readonly LookupSetting[];
  regions: readonly LookupSetting[];
}

export interface ItemModuleLookups {
  actor: BusinessActorRef;
  itemCategories: readonly LookupSetting[];
}

export interface CustomerItemOption {
  id: number;
  itemNo: string;
  name: string;
  spec: string | null;
  baseUnit: string;
}

export interface DefectCustomerOption {
  id: number;
  customerNo: string | null;
  shortName: string;
}

export interface DefectItemOption {
  id: number;
  itemNo: string;
  name: string;
  spec: string | null;
  isActive: boolean;
}

export interface DefectOwnerOption {
  id: number;
  employeeNo: string | null;
  isActive: boolean;
}

export interface DefectModuleLookups {
  actor: BusinessActorRef;
  customers: readonly DefectCustomerOption[];
  items: readonly DefectItemOption[];
  owners: readonly DefectOwnerOption[];
}
