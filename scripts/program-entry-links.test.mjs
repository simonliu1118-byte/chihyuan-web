import assert from "node:assert/strict";
import test from "node:test";
import { getProgramAction, verifiedProgramCatalog } from "../shared/program-catalog.ts";

test("unreleased independent website remains available without a fabricated Release", () => {
  const program = verifiedProgramCatalog.programs.find(p => p.id === "price-desk");
  assert.equal(program.version, null);
  assert.equal(program.releaseUrl, null);
  assert.equal(program.downloadUrl, null);
  assert.equal(program.publishedAt, null);
  assert.equal(program.icon, null);
  assert.deepEqual(getProgramAction(program), { kind: "website", url: "https://price-desk-simon.workspace-110444.chatgpt.site/" });
});

test("existing desktop release gates and website precedence are preserved", () => {
  for (const program of verifiedProgramCatalog.programs) {
    if (program.websiteUrl) assert.equal(getProgramAction(program).kind, "website");
    else if (!program.version) assert.deepEqual(getProgramAction(program), { kind: "pending" });
    else if (program.downloadUrl) assert.deepEqual(getProgramAction(program), { kind: "download", url: program.downloadUrl });
  }
  const base = verifiedProgramCatalog.programs.find(p => p.id === "envelope");
  assert.deepEqual(getProgramAction({ ...base, downloadUrl: "https://example.test/unreleased.zip" }), { kind: "pending" });
  assert.deepEqual(getProgramAction({ ...base, version: "0.1.0" }), { kind: "unavailable" });
  assert.equal(getProgramAction({ ...base, websiteUrl: "https://example.test/", downloadUrl: "https://example.test/file.zip", version: "0.1.0" }).kind, "website");
});
