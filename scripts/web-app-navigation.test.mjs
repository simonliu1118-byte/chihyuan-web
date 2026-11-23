import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

async function compile(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm", target: "node24" });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}
const { webApplicationNavigation } = await compile("src/runtime/navigation/web-app-navigation.ts");

const programs = [
  { id: "a", name: "A", platform: "web", icon: "ACC", websiteUrl: "https://known.example.test/path" },
  { id: "b", name: "B", platform: "windows", icon: "INV", websiteUrl: "https://windows.example.test" },
  { id: "c", name: "C", platform: "web", icon: null, websiteUrl: "https://noicon.example.test" },
  { id: "d", name: "D", platform: "web", icon: "ACC", websiteUrl: null },
];
const icons = { ACC: "/icons/acc.png", INV: "/icons/inv.png" };

test("web App entries use the registered name, the origin link and the catalog icon matched by origin", () => {
  const items = webApplicationNavigation([
    { applicationId: "KNOWN_APP", name: "價格觀測室", origin: "https://known.example.test" },
    { applicationId: "NEW_APP", name: "NewSys", origin: "https://new.example.test" },
    { applicationId: "WIN_APP", name: "Win", origin: "https://windows.example.test" },
    { applicationId: "NOICON_APP", name: "NoIcon", origin: "https://noicon.example.test" },
  ], programs, icons);
  assert.deepEqual(items, [
    { key: "web-KNOWN_APP", label: "價格觀測室", href: "https://known.example.test/", external: true, iconSrc: "/icons/acc.png" },
    { key: "web-NEW_APP", label: "NewSys", href: "https://new.example.test/", external: true, iconSrc: undefined },
    // Only web programs lend an icon; a Windows program with the same origin does not.
    { key: "web-WIN_APP", label: "Win", href: "https://windows.example.test/", external: true, iconSrc: undefined },
    { key: "web-NOICON_APP", label: "NoIcon", href: "https://noicon.example.test/", external: true, iconSrc: undefined },
  ]);
});

test("an empty or failed list yields no web entries", () => {
  assert.deepEqual(webApplicationNavigation([], programs, icons), []);
});

test("the sidebar no longer hard-codes web programs and loads the list once from the provider-backed endpoint", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  assert.ok(!/platform === "web" && !!program\.websiteUrl/.test(app), "no catalog-driven web links in the sidebar");
  assert.equal((app.match(/\/api\/sso\/applications/g) ?? []).length, 1);
  assert.match(app, /webApplicationNavigation\(webApps, verifiedProgramCatalog\.programs, programIcons\)/);
  assert.match(app, /\.catch\(\(\) => \{ if \(!controller\.signal\.aborted\) setWebApps\(\[\]\); \}\)/);
});
