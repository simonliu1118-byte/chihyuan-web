/**
 * Customer regions (user 2026-11-03): Taiwan's 22 counties and cities, grouped as in the legacy
 * customer sheet (北部／中部／南部／東部／離島). Not a secret and not user-maintained: migration
 * 0047 seeds the `regions` table with exactly these rows (ids 1–22 in this order), and a test keeps
 * the two in step. Codes follow the ISO 3166-2:TW county codes.
 */
export const REGION_GROUPS = [
  { code: "NORTH", label: "北部" },
  { code: "CENTRAL", label: "中部" },
  { code: "SOUTH", label: "南部" },
  { code: "EAST", label: "東部" },
  { code: "ISLANDS", label: "離島" },
] as const;
export type RegionGroupCode = typeof REGION_GROUPS[number]["code"];

export const TAIWAN_REGIONS: readonly { code: string; name: string; group: RegionGroupCode }[] = [
  { code: "KEE", name: "基隆市", group: "NORTH" },
  { code: "TPE", name: "臺北市", group: "NORTH" },
  { code: "NWT", name: "新北市", group: "NORTH" },
  { code: "TAO", name: "桃園市", group: "NORTH" },
  { code: "HSZ", name: "新竹市", group: "NORTH" },
  { code: "HSQ", name: "新竹縣", group: "NORTH" },
  { code: "ILA", name: "宜蘭縣", group: "NORTH" },
  { code: "MIA", name: "苗栗縣", group: "CENTRAL" },
  { code: "TXG", name: "臺中市", group: "CENTRAL" },
  { code: "CHA", name: "彰化縣", group: "CENTRAL" },
  { code: "NAN", name: "南投縣", group: "CENTRAL" },
  { code: "YUN", name: "雲林縣", group: "CENTRAL" },
  { code: "CYI", name: "嘉義市", group: "SOUTH" },
  { code: "CYQ", name: "嘉義縣", group: "SOUTH" },
  { code: "TNN", name: "臺南市", group: "SOUTH" },
  { code: "KHH", name: "高雄市", group: "SOUTH" },
  { code: "PIF", name: "屏東縣", group: "SOUTH" },
  { code: "HUA", name: "花蓮縣", group: "EAST" },
  { code: "TTT", name: "臺東縣", group: "EAST" },
  { code: "PEN", name: "澎湖縣", group: "ISLANDS" },
  { code: "KIN", name: "金門縣", group: "ISLANDS" },
  { code: "LIE", name: "連江縣", group: "ISLANDS" },
];

/**
 * Customer status lights (user 2026-11-03, after the legacy sheet): each status shows one light.
 * `emoji` is used inside native selects, where an option cannot draw a coloured dot.
 */
export const STATUS_LIGHTS = [
  { code: "GREEN", label: "綠", emoji: "🟢" },
  { code: "BLUE", label: "藍", emoji: "🔵" },
  { code: "YELLOW", label: "黃", emoji: "🟡" },
  { code: "ORANGE", label: "橘", emoji: "🟠" },
  { code: "RED", label: "紅", emoji: "🔴" },
  { code: "PURPLE", label: "紫", emoji: "🟣" },
  { code: "BLACK", label: "黑", emoji: "⚫" },
  { code: "CLOSED", label: "叉", emoji: "❌" },
] as const;
export type StatusLight = typeof STATUS_LIGHTS[number]["code"];
export const isStatusLight = (value: unknown): value is StatusLight => STATUS_LIGHTS.some(row => row.code === value);
export const statusLightEmoji = (value: string | null | undefined) => STATUS_LIGHTS.find(row => row.code === value)?.emoji ?? "";

/** The legacy status list, seeded by migration 0047 (ids 1–10; an existing id 1 keeps its code). */
export const LEGACY_CUSTOMER_STATUSES: readonly { code: string; name: string; light: StatusLight }[] = [
  { code: "S01", name: "正常", light: "GREEN" },
  { code: "S02", name: "已拜訪", light: "BLUE" },
  { code: "S03", name: "已報價待回應", light: "BLUE" },
  { code: "S04", name: "少量叫貨", light: "YELLOW" },
  { code: "S05", name: "針灸針以外往來", light: "YELLOW" },
  { code: "S06", name: "三個月無叫貨", light: "ORANGE" },
  { code: "S07", name: "一年無往來", light: "RED" },
  { code: "S08", name: "不滿不再往來", light: "RED" },
  { code: "S09", name: "不受歡迎客戶", light: "BLACK" },
  { code: "S10", name: "已歇業", light: "CLOSED" },
];
