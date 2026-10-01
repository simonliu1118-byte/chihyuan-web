export type SettingsAuthority = "USER" | "ADMIN" | "SUPER_ADMIN";

export type StructuralLookupKind =
  | "department"
  | "customer_category"
  | "customer_status"
  | "item_category";

export interface LookupSetting {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
  parentId?: number | null;
}

export interface CreateLookupSettingRequest {
  code: string;
  name: string;
  sortOrder?: number;
  parentId?: number | null;
}

export interface UpdateLookupSettingRequest {
  name: string;
  sortOrder: number;
  isActive: boolean;
  expectedUpdatedAt: string;
  parentId?: number | null;
}

export interface AppTagSetting {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  moduleCodes: readonly string[];
  updatedAt: string;
}

export interface CreateAppTagRequest {
  code: string;
  name: string;
  sortOrder?: number;
  moduleCodes?: readonly string[];
}

export interface UpdateAppTagRequest {
  name: string;
  sortOrder: number;
  isActive: boolean;
  moduleCodes: readonly string[];
  expectedUpdatedAt: string;
}

export interface SetMemberTagsRequest {
  memberId: number;
  tagIds: readonly number[];
}

export interface WorkLogCategorySetting {
  id: number;
  code: string;
  name: string;
  inputMode: "boolean" | "quantity";
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export interface CreateWorkLogCategorySettingRequest {
  code: string;
  name: string;
  inputMode: "boolean" | "quantity";
  unitLabel?: string | null;
  sortOrder?: number;
}

export interface UpdateWorkLogCategorySettingRequest {
  name: string;
  inputMode: "boolean" | "quantity";
  unitLabel?: string | null;
  sortOrder: number;
  isActive: boolean;
  expectedUpdatedAt: string;
}

export interface WorkLogPlatformSetting {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export interface CreateWorkLogPlatformSettingRequest {
  code: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateWorkLogPlatformSettingRequest {
  name: string;
  sortOrder: number;
  isActive: boolean;
  expectedUpdatedAt: string;
}

export interface WorkLogScoringRowSetting {
  id: number;
  workLogCategoryId: number | null;
  customName: string | null;
  scoreValue: string | null;
  description: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export interface UpsertWorkLogScoringRowRequest {
  id?: number;
  workLogCategoryId?: number | null;
  customName?: string | null;
  scoreValue?: string | null;
  description?: string | null;
  note?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  expectedUpdatedAt?: string;
}

export interface UpdateWorkLogScoringConfigRequest {
  targetAverageDailyScore?: string | null;
  minimumAverageDailyScore?: string | null;
  expectedRevision?: number | null;
}

export interface SettingsSnapshot {
  departments: readonly LookupSetting[];
  customerCategories: readonly LookupSetting[];
  customerStatuses: readonly LookupSetting[];
  regions: readonly LookupSetting[];
  itemCategories: readonly LookupSetting[];
  appTags: readonly AppTagSetting[];
  workLogCategories: readonly WorkLogCategorySetting[];
  workLogPlatforms: readonly WorkLogPlatformSetting[];
  workLogScoringRows: readonly WorkLogScoringRowSetting[];
  workLogScoringConfig: {
    targetAverageDailyScore: string | null;
    minimumAverageDailyScore: string | null;
    revision: number;
    updatedAt: string;
  } | null;
}
