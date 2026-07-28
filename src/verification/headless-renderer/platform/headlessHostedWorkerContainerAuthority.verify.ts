/**
 * Sprint 11E Phase 2E.1 / 2E.1A — Container + Fly template authority.
 * Run: npm run test:headless-hosted-worker-container-authority
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { buildHeadlessChromeLaunchArgs } from "@/features/headless-renderer/worker/chromium/chrome-launch-args";
import { HEADLESS_HOSTED_NODE_MAJOR } from "@/features/headless-renderer/worker/hosted";

const ROOT = path.resolve(__dirname, "../../../..");
const DEPLOY = path.join(ROOT, "deploy/headless-worker");

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("\nSprint 11E Phase 2E.1A — Hosted worker container authority\n");

  const dockerfile = readFileSync(path.join(DEPLOY, "Dockerfile"), "utf8");
  const entry = readFileSync(
    path.join(DEPLOY, "docker-entrypoint.sh"),
    "utf8",
  );
  const fly = readFileSync(
    path.join(DEPLOY, "fly.staging.template.toml"),
    "utf8",
  );

  test("Dockerfile pins Node 24 LTS, uses tini, non-root, system Chromium", () => {
    assert.equal(HEADLESS_HOSTED_NODE_MAJOR, 24);
    assert.match(dockerfile, /NODE_MAJOR=24/);
    assert.equal(dockerfile.includes("NODE_MAJOR=20"), false);
    assert.match(dockerfile, /node:\$\{NODE_MAJOR\}-bookworm-slim/);
    assert.match(dockerfile, /\btini\b/);
    assert.match(dockerfile, /chromium/);
    assert.match(dockerfile, /ffmpeg/);
    assert.match(dockerfile, /useradd/);
    assert.match(dockerfile, /USER worker/);
    assert.match(dockerfile, /PUPPETEER_SKIP_DOWNLOAD=1/);
    assert.equal(dockerfile.includes("puppeteer install"), false);
    assert.equal(dockerfile.includes("--no-sandbox"), false);
    assert.equal(dockerfile.includes("--disable-setuid-sandbox"), false);
    assert.match(dockerfile, /deployable_worker/);
    assert.match(dockerfile, /"deployable": true/);
    assert.match(dockerfile, /"canStartConsumerLoop": true/);
    assert.match(dockerfile, /page-render\.iife\.js/);
  });

  test("Dockerfile installs chromium-sandbox and asserts setuid helper", () => {
    assert.match(dockerfile, /^\s*chromium-sandbox\s*\\?\s*$/m);
    assert.match(dockerfile, /\/usr\/lib\/chromium\/chrome-sandbox/);
    assert.match(dockerfile, /stat -c '%u:%g' \/usr\/lib\/chromium\/chrome-sandbox/);
    assert.match(dockerfile, /test -u \/usr\/lib\/chromium\/chrome-sandbox/);
    assert.match(dockerfile, /test -x \/usr\/lib\/chromium\/chrome-sandbox/);
    assert.ok(
      dockerfile.includes("dpkg-query -W -f='${Version}' chromium") &&
        dockerfile.includes("dpkg-query -W -f='${Version}' chromium-sandbox"),
    );
    assert.equal(dockerfile.includes("CHROME_DEVEL_SANDBOX"), false);
    assert.equal(dockerfile.includes("--privileged"), false);
    assert.equal(dockerfile.includes("seccomp=unconfined"), false);
    assert.equal(dockerfile.includes("SYS_ADMIN"), false);
  });

  test("Dockerfile has no credentials / secrets / baked artifacts", () => {
    assert.equal(/R2_SECRET|DATABASE_URL=|sk_live|rediss:\/\//.test(dockerfile), false);
    assert.equal(dockerfile.includes("COPY src/"), false);
    assert.equal(dockerfile.includes(".env"), false);
  });

  test("entrypoint selects verify|render only", () => {
    assert.match(entry, /verify\|render/);
    assert.match(entry, /hosted-worker\.js/);
    assert.equal(entry.includes("next start"), false);
  });

  test("Fly template: placeholders, process VMs, repo-root Dockerfile, no public service", () => {
    assert.match(fly, /REPLACE_WITH_STAGING_APP_NAME/);
    assert.match(fly, /primary_region\s*=\s*"iad"/);
    assert.match(fly, /\[processes\]/);
    assert.match(fly, /verify\s*=\s*"verify"/);
    assert.match(fly, /render\s*=\s*"render"/);
    assert.match(fly, /kill_signal\s*=\s*"SIGTERM"/);
    assert.match(fly, /HEADLESS_HOSTED_IMAGE_CLASS\s*=\s*"deployable_worker"/);
    assert.equal(/HEADLESS_WORKER_MODE\s*=/.test(fly), false);
    assert.match(
      fly,
      /dockerfile\s*=\s*"deploy\/headless-worker\/Dockerfile"/,
    );
    assert.match(fly, /processes\s*=\s*\["verify"\]/);
    assert.match(fly, /processes\s*=\s*\["render"\]/);
    assert.match(fly, /memory_mb\s*=\s*8192/);
    assert.equal(/^\[\[services\]\]/m.test(fly), false);
    assert.equal(/^\[http_service\]/m.test(fly), false);
    assert.equal(/fly_api_token|SECRET_ACCESS_KEY|sk_live/i.test(fly), false);
    assert.equal(
      /HEADLESS_ALLOW_NO_SANDBOX_WITH_EXTERNAL_ISOLATION\s*=/.test(fly),
      false,
    );
  });

  test("default chrome launch has no --no-sandbox", () => {
    const args = buildHeadlessChromeLaunchArgs({});
    assert.equal(args.includes("--no-sandbox"), false);
  });

  test("Docker CLI availability reported honestly (not installed during phase)", () => {
    const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
    const flyctl = spawnSync("fly", ["version"], { encoding: "utf8" });
    const dockerOk = docker.status === 0;
    const flyOk = flyctl.status === 0;
    console.log(
      `  · docker: ${dockerOk ? "AVAILABLE" : "NOT INSTALLED"}`,
    );
    console.log(`  · flyctl: ${flyOk ? "AVAILABLE" : "NOT INSTALLED"}`);
    assert.ok(existsSync(path.join(DEPLOY, "Dockerfile")));
  });

  console.log(`\n${passed} passed\n`);
}

main();
