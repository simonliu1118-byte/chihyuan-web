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
