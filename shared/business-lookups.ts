import type { LookupSetting, RegionSetting } from "./settings";

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
  regions: readonly RegionSetting[];
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

export interface SalesWorkOrderCustomerOption {
  id: number;
  customerNo: string | null;
  shortName: string;
}

export interface SalesWorkOrderItemOption {
  id: number;
  itemNo: string;
  name: string;
  spec: string | null;
  baseUnit: string;
  allowedUnits: readonly string[];
  isActive: boolean;
}

export interface SalesWorkOrderOperatorOption {
  id: number;
  employeeNo: string | null;
  isActive: boolean;
}

export interface SalesWorkOrderModuleLookups {
  actor: BusinessActorRef;
  customers: readonly SalesWorkOrderCustomerOption[];
  items: readonly SalesWorkOrderItemOption[];
  operators: readonly SalesWorkOrderOperatorOption[];
}

export interface OutsourcingItemOption {
  id: number;
  itemNo: string;
  name: string;
  spec: string | null;
  baseUnit: string;
  allowedUnits: readonly string[];
  isActive: boolean;
}

export interface OutsourcingModuleLookups {
  actor: BusinessActorRef;
  items: readonly OutsourcingItemOption[];
}
