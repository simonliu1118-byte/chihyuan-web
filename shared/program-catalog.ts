export type ProgramId = "accounting-web" | "accounting" | "invoice" | "tri-invoice-calc" | "converter" | "erp-auto-input" | "erp-auto-query" | "envelope" | "watermark" | "price-desk";
export interface ProgramEntry {
  id: ProgramId;
  name: string;
  platform: "web" | "windows";
  icon: "ACC" | "INV" | "CAL" | "CVT" | "Auto" | "AutoQ" | "ENV" | "WM" | null;
  description: string;
  version: string | null;
  publishedAt: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  websiteUrl: string | null;
}
export interface ProgramCatalog {
  programs: readonly ProgramEntry[];
  checkedAt: string;
  current: boolean;
  automaticUpdate?: {
    status: "pending" | "ready" | "failed" | "overdue";
    lastAttemptAt: string | null;
    nextUpdateAt: string;
  };
  refreshFailure?: { code: "HTTP" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK" | "BODY" | "TOO_LARGE" | "INVALID" | "PAGE_LIMIT" | "MISSING"; httpStatus?: number };
}

/** Daily 03:00 Asia/Taipei (UTC+8), independent of the backup schedule. */
export const PROGRAM_CATALOG_CRON = "0 19 * * *";
export function programCatalogDay(now: number): string {
  return new Date(now + 5 * 3600000).toISOString().slice(0, 10);
}
export function nextProgramCatalogUpdate(now: number): string {
  const day = new Date(now + 5 * 3600000);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1) - 5 * 3600000).toISOString();
}

export type ProgramAction = { kind: "website"; url: string } | { kind: "download"; url: string }
  | { kind: "pending" } | { kind: "unavailable" };

/** Website availability is independent from formal desktop release availability. */
export function getProgramAction(program: ProgramEntry): ProgramAction {
  if (program.websiteUrl) return { kind: "website", url: program.websiteUrl };
  if (!program.version) return { kind: "pending" };
  if (program.downloadUrl) return { kind: "download", url: program.downloadUrl };
  return { kind: "unavailable" };
}

/** Verified public release snapshot; live lookups only replace release fields. */
export const verifiedProgramCatalog: ProgramCatalog = {
  checkedAt: "2026-10-16T02:30:36Z", current: false,
  programs: [
    { id: "accounting-web", name: "志遠記帳系統 Web 版", platform: "web", icon: "ACC",
      description: "多人網頁記帳，支援帳戶與科目管理、收支查詢、自動期初餘額及 Excel 匯出，可於電腦與手機使用。",
      version: "0.22.15", publishedAt: "2026-10-05T02:11:38Z", websiteUrl: "https://acc.chihyuancm.com",
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/cyaccountingweb-v0.22.15", downloadUrl: null },
    { id: "accounting", name: "志遠記帳系統", platform: "windows", icon: "ACC",
      description: "Windows 記帳工具，支援收支登錄、帳戶與科目管理、Excel 匯入、月份鎖帳及本機／雲端備份。",
      version: "1.3.0", publishedAt: "2026-09-25T19:03:30Z", websiteUrl: null,
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/cyaccounting-v1.3.0",
      downloadUrl: "https://github.com/simonliu1118-byte/CYapps/releases/download/cyaccounting-v1.3.0/CYAccounting_V1.3.0_Windows_x64.zip" },
    { id: "invoice", name: "電子發票工具", platform: "windows", icon: "INV",
      description: "Windows 電子發票工具，支援手動開立、Excel 資料匯入、發票查詢、作廢及 PDF 預覽與列印。",
      version: "2.6.19", publishedAt: "2026-10-13T02:28:56Z", websiteUrl: null,
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/cyinvoice-v2.6.19",
      downloadUrl: "https://github.com/simonliu1118-byte/CYapps/releases/download/cyinvoice-v2.6.19/CYInvoice_V2.6.19.zip" },
    { id: "tri-invoice-calc", name: "三聯式發票開立計算機", platform: "windows", icon: "CAL",
      description: "將含稅商品資料換算為未稅單價、銷售額及營業稅，自動分配四捨五入尾差，並即時預覽三聯式發票版面。",
      version: "1.5.6", publishedAt: "2026-10-15T16:27:43Z", websiteUrl: null,
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/TriINVCalc-v1.5.6",
      downloadUrl: "https://github.com/simonliu1118-byte/CYapps/releases/download/TriINVCalc-v1.5.6/TriINVCalc_V1.5.6.zip" },
    { id: "converter", name: "SMART 銷貨單格式轉換工具", platform: "windows", icon: "CVT",
      description: "將 ERP COPI08 匯出的 Excel 交易資料轉換為 SMART 銷貨單匯入格式，檢查必要欄位並避免覆蓋同名輸出檔案。",
      version: "1.0.1", publishedAt: "2026-10-15T17:13:11Z", websiteUrl: null,
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/smartcopiconverter-v1.0.1",
      downloadUrl: "https://github.com/simonliu1118-byte/CYapps/releases/download/smartcopiconverter-v1.0.1/SMARTCOPIConverter_V1.0.1_Windows_x64.zip" },
    { id: "erp-auto-input", name: "SMART ERP 自動輸入工具", platform: "windows", icon: "Auto",
      description: "支援蝦皮、MO店+與酷澎訂單匯入，將銷貨單表頭與商品明細自動輸入 SMART ERP，並可依設定儲存及列印。",
      version: "0.2.9", publishedAt: "2026-10-12T08:56:08Z", websiteUrl: null,
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/cyerp-auto-input-v0.2.9",
      downloadUrl: "https://github.com/simonliu1118-byte/CYapps/releases/download/cyerp-auto-input-v0.2.9/CYERPAutoInput_V0.2.9.zip" },
    { id: "erp-auto-query", name: "SMART ERP 自動查詢工具", platform: "windows", icon: "AutoQ",
      description: "在公司內網電腦接收 CY Web 的查詢，自動到 SMART ERP 查品號、批號庫存與歷史異動、客戶、廠商、銷貨銷退單、進貨退貨單及未收款，只查詢不修改 ERP 資料。",
      version: null, publishedAt: null, releaseUrl: null, downloadUrl: null, websiteUrl: null },
    { id: "envelope", name: "信封套印工具", platform: "windows", icon: "ENV",
      description: "支援收件人與地址管理、臺灣郵遞區號查詢、信封版面位置與字型設定，以及 Windows 印表機套印。",
      version: null, publishedAt: null, releaseUrl: null, downloadUrl: null, websiteUrl: null },
    { id: "watermark", name: "盲浮水印工具", platform: "windows", icon: "WM",
      description: "商品圖片盲浮水印工具，支援批次嵌入、圖片驗證與 PDF 驗證報告。",
      version: null, publishedAt: null, releaseUrl: null, downloadUrl: null, websiteUrl: null },
    { id: "price-desk", name: "價格觀測室（原型）", platform: "web", icon: null,
      description: "獨立查價原型，手動記錄商品與蝦皮、momo 等平台報價，比較最低價及價差。使用 ChatGPT 私有登入；資料儲存在目前瀏覽器。",
      version: null, publishedAt: null, releaseUrl: null, downloadUrl: null,
      websiteUrl: "https://price-desk-simon.workspace-110444.chatgpt.site/" },
  ],
};
