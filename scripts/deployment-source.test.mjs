import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { verifyDeploymentSource } from "./verify-deployment-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = "a".repeat(40), other = "b".repeat(40), tree = "c".repeat(40);
const source = { event: "workflow_dispatch", ref: "refs/heads/main", eventSha: sha, checkoutSha: sha, mainSha: sha,
  checkoutTree: tree, mainTree: tree, containsMain: true };

test("only a main dispatch may deploy", () => {
  verifyDeploymentSource(source);
  for (const override of [{ event: "pull_request" }, { event: "push" },
    { ref: "refs/heads/deploy/cyweb-development" }, { ref: "refs/heads/audit/cyweb-identity" },
    { ref: "refs/tags/main" }])
    assert.throws(() => verifyDeploymentSource({ ...source, ...override }), /EVENT_NOT_ALLOWED/);
});

test("the checkout must be the current main commit", () => {
  for (const override of [{ eventSha: other }, { mainSha: other }, { checkoutTree: other }, { containsMain: false }])
    assert.throws(() => verifyDeploymentSource({ ...source, ...override }), /MUST_MATCH_CURRENT_MAIN/);
  assert.throws(() => verifyDeploymentSource({ ...source, mainSha: "" }), /SOURCE_REQUIRED/);
});

test("CLI uses real Git history: current main passes, stale main fails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyweb-deploy-"));
  const checkout = path.join(dir, "checkout"), origin = path.join(dir, "origin.git");
  const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const run = () => spawnSync(process.execPath, [path.join(root, "scripts/verify-deployment-source.mjs")], {
    cwd: checkout, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_SHA: git("rev-parse", "HEAD") },
  });
  try {
    execFileSync("git", ["init", "--bare", origin], { stdio: "ignore" });
    execFileSync("git", ["init", "--initial-branch=main", checkout], { stdio: "ignore" });
    git("config", "user.name", "Deployment test");
    git("config", "user.email", "286269326+simonliu1118-byte@users.noreply.github.com");
    fs.writeFileSync(path.join(checkout, "source.txt"), "reviewed\n");
    git("add", "."); git("commit", "-m", "Reviewed main");
    git("remote", "add", "origin", origin); git("push", "origin", "main");
    assert.equal(run().status, 0);
    const stale = git("rev-parse", "HEAD");
    git("commit", "--allow-empty", "-m", "Main advanced"); git("push", "origin", "main");
    git("checkout", "--detach", stale);
    assert.match(run().stderr, /MUST_MATCH_CURRENT_MAIN/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("workflow serializes writes, limits dispatch, and guards before migration", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/development-deploy.yml"), "utf8").replaceAll('\r\n', '\n');
  const deploy = workflow.split("\n  deploy-development:\n")[1].split("\n  audit-identity:\n")[0];
  assert.match(deploy, /\(inputs\.operation == 'deploy-development' \|\| inputs\.operation == 'rotate-recovery'\) && github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /if: github\.event_name == 'workflow_dispatch' && inputs\.operation == 'rotate-recovery'/);
  assert.match(deploy, /grep -q 'RECOVERY_NEW_TARGET_PREPARED_OLD_PRESERVED'/);
  assert.match(deploy, /grep -q 'RECOVERY_ROTATION_PRIMARY_MIGRATIONS_OUTDATED'/);
  assert.ok(deploy.indexOf('RECOVERY_ROTATION_PRIMARY_MIGRATIONS_OUTDATED') < deploy.indexOf('node scripts/provision-backup-recovery.mjs'));
  assert.ok(deploy.indexOf("Require reviewed rotation implementation") < deploy.indexOf("node scripts/verify-deployment-source.mjs"));
  assert.match(deploy, /group: cyweb-production\s*\n\s*cancel-in-progress: false/);
  assert.match(deploy, /fetch-depth: 0/);
  const guard = deploy.indexOf("node scripts/verify-deployment-source.mjs");
  assert.ok(guard > 0 && guard < deploy.indexOf("npx wrangler d1 migrations apply DB --remote"));
  for (const required of ["Resolve canonical production Identity", "Verify daily program catalog schedule", "Require canonical production portal authority"])
    assert.ok(deploy.includes(required));
  assert.match(workflow, /node --test .*scripts\/deployment-source\.test\.mjs/);
  assert.match(workflow, /group: cyweb-identity-audit-/);
});
