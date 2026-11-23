import assert from "node:assert/strict";
import test from "node:test";
import { getProgramAction, verifiedProgramCatalog } from "../shared/program-catalog.ts";

test("unreleased independent website remains available without a fabricated Release", () => {
  const program = verifiedProgramCatalog.programs.find(p => p.id === "price-desk");
  assert.equal(program.version, null);
  assert.equal(program.releaseUrl, null);
  assert.equal(program.downloadUrl, null);
  assert.equal(program.publishedAt, null);
  assert.equal(program.icon, "PRC");
  assert.deepEqual(getProgramAction(program), { kind: "website", url: "https://price.chihyuancm.com/" });
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

test("sidebar web-program links use the program's CY app icon", async () => {
  const fs = await import("node:fs");
  const app = fs.readFileSync("src/App.tsx", "utf8"), shell = fs.readFileSync("src/ui/shell/AppShell.tsx", "utf8");
  const nav = fs.readFileSync("src/runtime/navigation/web-app-navigation.ts", "utf8");
  assert.match(app, /webApplicationNavigation\(webApps, verifiedProgramCatalog\.programs, programIcons\)/);
  assert.match(nav, /program\.icon \? icons\[program\.icon\] : undefined/);
  assert.match(shell, /item\.iconSrc \? <img className="cy-shell-nav-icon cy-shell-nav-app-icon"/);
  for (const program of verifiedProgramCatalog.programs.filter(p => p.platform === "web" && p.websiteUrl)) assert.ok(program.icon, program.id);
});
