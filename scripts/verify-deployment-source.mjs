import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const DEPLOYMENT_REF = "refs/heads/deploy/cyweb-development";

export function verifyDeploymentSource({ event, ref, eventSha, checkoutSha, mainSha, checkoutTree, mainTree, containsMain }) {
  if (!((event === "push" && ref === DEPLOYMENT_REF)
    || (event === "workflow_dispatch" && ref === "refs/heads/main")))
    throw Error("DEPLOYMENT_EVENT_NOT_ALLOWED");
  if (![eventSha, checkoutSha, mainSha, checkoutTree, mainTree].every(value => /^[0-9a-f]{40}$/.test(value ?? "")))
    throw Error("DEPLOYMENT_SOURCE_REQUIRED");
  if (eventSha !== checkoutSha || checkoutTree !== mainTree || containsMain !== true
    || (event === "workflow_dispatch" && checkoutSha !== mainSha))
    throw Error("DEPLOYMENT_SOURCE_MUST_MATCH_CURRENT_MAIN");
}

// The existing publish branch includes historical merge commits. Require reviewed
// main ancestry and identical tracked bytes, while preserving that branch history.
export function verifyCurrentCheckout(env = process.env) {
  const git = (...args) => execFileSync("git", args, {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
  }).trim();
  let source;
  try {
    const checkoutSha = git("rev-parse", "HEAD");
    git("fetch", "--no-tags", "origin", "refs/heads/main");
    const mainSha = git("rev-parse", "FETCH_HEAD");
    const remote = git("ls-remote", "--exit-code", "origin", "refs/heads/main");
    if (remote !== `${mainSha}\trefs/heads/main`) throw Error();
    const checkoutTree = git("rev-parse", `${checkoutSha}^{tree}`);
    const mainTree = git("rev-parse", `${mainSha}^{tree}`);
    let containsMain = false;
    try { git("merge-base", "--is-ancestor", mainSha, checkoutSha); containsMain = true; } catch {}
    source = { checkoutSha, mainSha, checkoutTree, mainTree, containsMain };
  } catch {
    throw Error("DEPLOYMENT_MAIN_LOOKUP_FAILED");
  }
  verifyDeploymentSource({ ...source, event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, eventSha: env.GITHUB_SHA });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyCurrentCheckout();
    console.log("Deployment source contains current main and has the identical tracked tree.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
