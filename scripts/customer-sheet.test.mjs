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

const fields = fn => { try { fn(); return {}; } catch (error) { return error.fields ?? { error: error.message }; } };

test("customer number, short name and tax id follow the agreed limits", () => {
  assert.deepEqual(fields(() => normalizeCreateCustomerRequest({ shortName: "大大中醫", customerNo: "Ac00000001", taxId: "12345678" })), {});
  assert.ok(fields(() => normalizeCreateCustomerRequest({ shortName: "大大中醫", customerNo: "AC-0001" })).customerNo);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ shortName: "大大中醫", customerNo: "AC000000001" })).customerNo);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ shortName: "一二三四五六七八九十十一" })).shortName);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ shortName: "大大中醫", taxId: "1234567" })).taxId);
});

test("phones carry a kind; at most three faxes; digits only", () => {
  const fax = n => ({ kind: "FAX", phoneNumber: "022345679" + n, sortOrder: n });
  const ok = normalizeCreateCustomerRequest({ shortName: "大大", phones: [{ phoneNumber: "0223456789", extension: "12345", sortOrder: 0 }, fax(1), fax(2), fax(3)] });
  assert.deepEqual(ok.phones.map(row => row.kind), ["PHONE", "FAX", "FAX", "FAX"]);
  assert.equal(ok.phones[0].extension, "12345");
  assert.ok(fields(() => normalizeCreateCustomerRequest({ shortName: "大大", phones: [fax(1), fax(2), fax(3), fax(4)] })).phones);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ shortName: "大大", phones: [{ phoneNumber: "02-2345-6789", sortOrder: 0 }] }))["phones.0.phoneNumber"]);
});

test("important notes are single lines, at most five; postal code is 3 or 6 digits", () => {
  const notes = n => Array.from({ length: n }, (_, i) => ({ content: "註記" + i, sortOrder: i }));
  assert.equal(normalizeCreateCustomerRequest({ shortName: "大大", notes: notes(5) }).notes.length, 5);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ shortName: "大大", notes: notes(6) })).notes);
  assert.ok(fields(() => normalizeCreateCustomerRequest({ shortName: "大大", notes: [{ content: "一\n二", sortOrder: 0 }] }))["notes.0.content"]);
  const address = postalCode => fields(() => normalizeCreateCustomerRequest({ shortName: "大大", addresses: [{ postalCode, address: "台北市", sortOrder: 0 }] }));
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
