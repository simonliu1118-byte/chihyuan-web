// Exact pre/post-0033 migration-chain fingerprints. LF/CRLF source layouts are explicitly pinned.
export const STORE_LEGACY_SCHEMAS = ["25e4d9c09be2cada33d1a163349ba12e1e03a84aac95ebbad6892fba0a52cfa5","4410979cb95b83a81bcf3e502796686cf7180b20664722483c19ad0c0c755216"];
export const STORE_WORKFLOW_SCHEMAS = ["abd2902719da396f298c95ced1242086f9bce0a8bf34c495a1a841a8a787983e","9f261248a129c20a5b91d7f2d85741ab0eef58c154483db42824180187910b61","d020c8896831546320388f85babab88a1bae9bf026f8f83ff01ee9f70832ccb5"];
export const STORE_LEGACY_COLUMNS:Record<string,string[]> = {
  "store_customer_orders": [
    "cancel_reason",
    "created_at",
    "created_by",
    "customer_name",
    "deposit",
    "id",
    "line_name",
    "note",
    "notified_at",
    "order_date",
    "phone",
    "status",
    "updated_at",
    "updated_by",
    "version"
  ],
  "store_blacklist": [
    "action",
    "created_at",
    "created_by",
    "id",
    "name",
    "phone",
    "reason",
    "updated_at",
    "updated_by"
  ]
};
