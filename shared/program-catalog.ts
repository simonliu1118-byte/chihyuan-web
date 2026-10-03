export type ProgramId = "accounting-web" | "accounting" | "invoice" | "tri-invoice-calc" | "converter" | "envelope" | "watermark";
export interface ProgramEntry {
  id: ProgramId;
  name: string;
  platform: "web" | "windows";
  icon: "ACC" | "INV" | "CAL" | "CVT" | "ENV" | "WM";
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
}

/** Verified public release snapshot; live lookups only replace release fields. */
export const verifiedProgramCatalog: ProgramCatalog = {
  checkedAt: "2026-10-02T16:10:14Z", current: false,
  programs: [
    { id: "accounting-web", name: "志遠記帳系統 Web 版", platform: "web", icon: "ACC",
      description: "多人網頁記帳，支援帳戶與科目管理、收支查詢、自動期初餘額及 Excel 匯出，可於電腦與手機使用。",
      version: "0.22.0", publishedAt: "2026-10-02T15:36:44Z", websiteUrl: "https://acc.chihyuancm.com",
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/cyaccountingweb-v0.22.0", downloadUrl: null },
    { id: "accounting", name: "志遠記帳系統", platform: "windows", icon: "ACC",
      description: "Windows 記帳工具，支援收支登錄、帳戶與科目管理、Excel 匯入、月份鎖帳及本機／雲端備份。",
      version: "1.3.0", publishedAt: "2026-09-25T19:03:30Z", websiteUrl: null,
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/cyaccounting-v1.3.0",
      downloadUrl: "https://github.com/simonliu1118-byte/CYapps/releases/download/cyaccounting-v1.3.0/CYAccounting_V1.3.0_Windows_x64.zip" },
    { id: "invoice", name: "CY 電子發票工具", platform: "windows", icon: "INV",
      description: "Windows 電子發票工具，支援手動開立、Excel 資料匯入、發票查詢、作廢及 PDF 預覽與列印。",
      version: "2.4.2", publishedAt: "2026-09-18T20:09:10Z", websiteUrl: null,
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/cyinvoice-v2.4.2",
      downloadUrl: "https://github.com/simonliu1118-byte/CYapps/releases/download/cyinvoice-v2.4.2/CYInvoice_V2.4.2.zip" },
    { id: "tri-invoice-calc", name: "三聯式發票開立計算機", platform: "windows", icon: "CAL",
      description: "將含稅商品資料換算為未稅單價、銷售額及營業稅，自動分配四捨五入尾差，並即時預覽三聯式發票版面。",
      version: "1.5.5", publishedAt: "2026-09-13T07:36:40Z", websiteUrl: null,
      releaseUrl: "https://github.com/simonliu1118-byte/CYapps/releases/tag/TriINVCalc-v1.5.5",
      downloadUrl: "https://github.com/simonliu1118-byte/CYapps/releases/download/TriINVCalc-v1.5.5/TriINVCalc_V1.5.5.zip" },
    { id: "converter", name: "SMART 銷貨單格式轉換工具", platform: "windows", icon: "CVT",
      description: "將鼎新 ERP COPI08 匯出的 Excel 交易資料轉換為 SMART 銷貨單匯入格式，檢查必要欄位並避免覆蓋同名輸出檔案。",
      version: null, publishedAt: null, releaseUrl: null, downloadUrl: null, websiteUrl: null },
    { id: "envelope", name: "CYEnvelope 信封套印工具", platform: "windows", icon: "ENV",
      description: "支援收件人與地址管理、臺灣郵遞區號查詢、信封版面位置與字型設定，以及 Windows 印表機套印。",
      version: null, publishedAt: null, releaseUrl: null, downloadUrl: null, websiteUrl: null },
    { id: "watermark", name: "CYWatermark 盲浮水印工具", platform: "windows", icon: "WM",
      description: "商品圖片盲浮水印工具，支援批次嵌入、圖片驗證與 PDF 驗證報告。",
      version: null, publishedAt: null, releaseUrl: null, downloadUrl: null, websiteUrl: null },
  ],
};
