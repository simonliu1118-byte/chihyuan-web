// V0.9.95 customer sheet (user 2026-11-03): field limits, phone entry format and postal-code prefill.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function load(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
}
const { normalizeCreateCustomerRequest } = await load("worker/customer/customer-validation.ts");
const { formatPhoneEntry, parsePhoneEntry } = await load("shared/phone.ts");
const { postalCodeForAddress } = await load("shared/taiwan-postal.ts");

// Required (user 2026-11-03): 簡稱、全稱、分類、地區、狀態.
const base = { fullName: "大大中醫診所", customerCategoryId: 1, regionId: 1, customerStatusId: 1 };
const fields = fn => { try { fn(); return {}; } catch (error) { return error.fields ?? { error: error.message }; } };

test("customer number, short name and tax id follow the agreed limits", () => {
  assert.deepEqual(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大中醫", customerNo: "Ac00000001", taxId: "12345678" })), {});
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大中醫", customerNo: "AC-0001" })).customerNo);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大中醫", customerNo: "AC000000001" })).customerNo);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "一二三四五六七八九十十一" })).shortName);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大中醫", taxId: "1234567" })).taxId);
});

test("phones carry a kind; at most three faxes; digits only", () => {
  const fax = n => ({ kind: "FAX", phoneNumber: "022345679" + n, sortOrder: n });
  const ok = normalizeCreateCustomerRequest({ ...base, shortName: "大大", phones: [{ phoneNumber: "0223456789", extension: "12345", sortOrder: 0 }, fax(1), fax(2), fax(3)] });
  assert.deepEqual(ok.phones.map(row => row.kind), ["PHONE", "FAX", "FAX", "FAX"]);
  assert.equal(ok.phones[0].extension, "12345");
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", phones: [fax(1), fax(2), fax(3), fax(4)] })).phones);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", phones: [{ phoneNumber: "02-2345-6789", sortOrder: 0 }] }))["phones.0.phoneNumber"]);
});

test("notes are single lines; at most twenty, five of them important; postal code is 3 or 6 digits", () => {
  const notes = (n, important = 0) => Array.from({ length: n }, (_, i) => ({ content: "註記" + i, isImportant: i < important, sortOrder: i }));
  const saved = normalizeCreateCustomerRequest({ ...base, shortName: "大大", notes: notes(20, 5) }).notes;
  assert.equal(saved.length, 20);
  assert.equal(saved.filter(row => row.isImportant).length, 5);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", notes: notes(21) })).notes);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", notes: notes(6, 6) })).notes);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", notes: [{ content: "一\n二", sortOrder: 0 }] }))["notes.0.content"]);
  const address = postalCode => fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", addresses: [{ postalCode, address: "台北市", sortOrder: 0 }] }));
  assert.deepEqual(address("106"), {});
  assert.deepEqual(address("106054"), {});
  assert.ok(address("1060")["addresses.0.postalCode"]);
});

test("phone entry shows (02)2345-6789 #12345 and 0912-345-678; typing splits at #", () => {
  assert.equal(formatPhoneEntry("0223456789", "12345"), "(02)2345-6789 #12345");
  assert.equal(formatPhoneEntry("0912345678", null), "0912-345-678");
  assert.deepEqual(parsePhoneEntry("(02)2345-6789 #12345"), { number: "0223456789", extension: "12345" });
  assert.deepEqual(parsePhoneEntry("0912-345-678"), { number: "0912345678", extension: null });
});

test("postal code prefill reads city and district, 台 or 臺, and leaves unknown addresses alone", () => {
  assert.equal(postalCodeForAddress("台北市大安區復興南路一段100號"), "106");
  assert.equal(postalCodeForAddress("臺南市東區大學路1號"), "701");
  assert.equal(postalCodeForAddress("新竹市東區光復路"), "300");
  assert.equal(postalCodeForAddress("大安區復興南路"), null);
});

test("payment terms and invoice type are optional text up to 20 characters", () => {
  const ok = normalizeCreateCustomerRequest({ ...base, shortName: "大大", paymentTerms: "月結", invoiceType: "開立二聯式" });
  assert.equal(ok.paymentTerms, "月結");
  assert.equal(ok.invoiceType, "開立二聯式");
  assert.equal(normalizeCreateCustomerRequest({ ...base, shortName: "大大" }).paymentTerms, null);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", paymentTerms: "一".repeat(21) })).paymentTerms);
});

test("full name, category, region and status are required; contact name and address are not", () => {
  const missing = fields(() => normalizeCreateCustomerRequest({ shortName: "大大" }));
  for (const field of ["fullName", "customerCategoryId", "regionId", "customerStatusId"]) assert.ok(missing[field], field);
  const ok = normalizeCreateCustomerRequest({ ...base, shortName: "大大",
    contacts: [{ mobile: "0912345678", sortOrder: 0, isActive: true }], addresses: [{ postalCode: "106", sortOrder: 0 }] });
  assert.equal(ok.contacts[0].name, null);
  assert.equal(ok.addresses[0].address, null);
});

test("regions and legacy statuses in code match migration 0047 and the restore seeds", async () => {
  const { readFileSync } = await import("node:fs");
  const { TAIWAN_REGIONS, LEGACY_CUSTOMER_STATUSES, STATUS_LIGHTS } = await load("shared/taiwan-regions.ts");
  const { MIGRATION_SEEDS } = await load("shared/backup-migration-seeds.ts");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE regions (id INTEGER PRIMARY KEY, code TEXT, name TEXT, group_code TEXT, sort_order INTEGER, is_active INTEGER);"
    + "CREATE TABLE customer_statuses (id INTEGER PRIMARY KEY, code TEXT, name TEXT, sort_order INTEGER, is_active INTEGER, updated_at TEXT, updated_by INTEGER);");
  const sql = readFileSync("migrations/0047_customer_regions_status_lights.sql", "utf8");
  const statements = sql.split(";").map(part => part.replace(/^\s*--.*$/gm, "").trim())
    .filter(part => /^INSERT OR IGNORE INTO (regions|customer_statuses)|^ALTER TABLE customer_statuses/.test(part));
  for (const statement of statements) db.exec(statement);
  assert.deepEqual(db.prepare("SELECT code, name, group_code AS g FROM regions ORDER BY id").all().map(r => [r.code, r.name, r.g]),
    TAIWAN_REGIONS.map(r => [r.code, r.name, r.group]));
  assert.deepEqual(db.prepare("SELECT code, name, light FROM customer_statuses ORDER BY id").all().map(r => [r.code, r.name, r.light]),
    LEGACY_CUSTOMER_STATUSES.map(r => [r.code, r.name, r.light]));
  for (const table of ["regions", "customer_statuses"]) {
    const seed = MIGRATION_SEEDS[table];
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${seed.predicate}`).get().n, seed.count, table);
  }
  assert.match(sql, new RegExp(STATUS_LIGHTS.map(l => `'${l.code}'`).join(", ")));
});

test("business profile: categorised description lines and prospect items (ours or typed)", () => {
  const ok = normalizeCreateCustomerRequest({ ...base, shortName: "大大",
    profileNotes: [{ category: "EQUIPMENT", content: "使用電針機兩台" }, { category: "CAUTION", content: "午休不拜訪" }],
    prospectItems: [{ itemId: 3, stage: "USING_OTHER", brand: "他牌" }, { itemName: "艾灸盒", stage: "RECOMMEND" }] });
  assert.deepEqual(ok.profileNotes.map(row => row.category), ["EQUIPMENT", "CAUTION"]);
  assert.equal(ok.prospectItems[0].itemName, null);
  assert.equal(ok.prospectItems[1].itemId, null);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", profileNotes: [{ category: "X", content: "a" }] }))["profileNotes.0.category"]);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", prospectItems: [{ stage: "QUOTED" }] }))["prospectItems.0.itemName"]);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ ...base, shortName: "大大", prospectItems: [{ itemName: "a", stage: "NOPE" }] }))["prospectItems.0.stage"]);
});
