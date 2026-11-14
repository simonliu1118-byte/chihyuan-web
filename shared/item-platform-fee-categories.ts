// Stable platform identities seeded by 0061; editable platform names are not keys.
export const ITEM_FEE_CATEGORY_PLATFORMS = [
  {platformId: 1, label: '蝦皮品類'},
  {platformId: 2, label: 'Mo+品類'},
] as const;
export const needsFeeCategory = (platformId: number) => ITEM_FEE_CATEGORY_PLATFORMS.some(p => p.platformId === platformId);
export interface ItemPlatformFeeSelection {platformId: number; categoryId: string}
export interface PlatformFeeCategoryOption {id: string; name: string}
