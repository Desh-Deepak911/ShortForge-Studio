/**
 * Sprint 11E Phase 2A.1 — Clerk failure + owner authority hardening verification.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import {
  ClerkHeadlessPrincipalAdapter,
  classifyClerkEnvironment,
  CLERK_ENV_KEY_MAX_LENGTH,
  composeProductionHeadlessControlPlane,
  gateHeadlessRouteAuth,
  isClerkEnvironmentConfigured,
  runHeadlessClerkProxy,
  UnavailableHeadlessDownloadCapabilityAdapter,
  UnavailableHeadlessUploadCapabilityAdapter,
  validateClerkAuthSnapshot,
  validateHeadlessAuthenticatedPrincipal,
  type ClerkEnvironmentStatus,
} from "@/features/headless-renderer/control-plane";
import { UnavailableHeadlessProjectAuthorizationAdapter } from "@/features/headless-renderer/control-plane/adapters/unavailable-project-authorization.adapter";
import {
  composeTestHeadlessControlPlane,
  TestHeadlessPrincipalAdapter,
  TestHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import {
  availabilityFromGate,
  handleHeadlessRouteAuthResponse,
  jsonFromHeadlessRouteGate,
} from "@/app/api/headless-render/_lib/respond-headless-route-auth";
import {
  HEADLESS_AUTHENTICATION_REQUIRED,
  HEADLESS_AUTH_TEMPORARILY_UNAVAILABLE,
  PRODUCTION_HEADLESS_UNAVAILABLE,
} from "@/features/headless-renderer/product/availability/availability.types";
import { HEADLESS_MAX_ID_LENGTH } from "@/features/headless-renderer/domain/headless-render-constants";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function envBag(keys: Record<string, unknown>): Record<string, unknown> {
  return { ...keys };
}

function mockCompose(input: {
  clerkConfigured: boolean;
  reader?: () => Promise<unknown>;
  classifyEnv?: () => ClerkEnvironmentStatus;
}): typeof composeProductionHeadlessControlPlane {
  return () => {
    const classify =
      input.classifyEnv ??
      (() => (input.clerkConfigured ? "configured" : "unconfigured"));
    const principal = new ClerkHeadlessPrincipalAdapter(
      input.reader ?? (async () => ({
        userId: null,
        sessionId: null,
        sessionStatus: null,
      })),
      classify,
    );
    return {
      productionAvailable: false as const,
      canCreateJob: false as const,
      reason: "CONFIGURATION_UNAVAILABLE" as const,
      activationStatus: "disabled" as const,
      stagingSessionConfigured: classify() === "configured",
      stagingSessionEnvironmentStatus:
        classify() === "configured" ? "configured" : "absent",
      neonDatabaseConfigured: false as const,
      neonEnvironmentStatus: "unconfigured" as const,
      r2EnvironmentStatus: "unconfigured" as const,
      r2Configured: false as const,
      upstashProducerEnvironmentStatus: "unconfigured" as const,
      upstashProducerConfigured: false as const,
      upstashRestProducer: null,
      queueProvider: {
        status: "unconfigured" as const,
        provider: "upstash" as const,
        envName: "local" as const,
      },
      verifyWake: null,
      principal,
      projectAuthorization: new UnavailableHeadlessProjectAuthorizationAdapter(),
      jobStore: null,
      ownedObjectStore: null,
      uploadCapability: new UnavailableHeadlessUploadCapabilityAdapter(),
      downloadCapability: new UnavailableHeadlessDownloadCapabilityAdapter(),
    };
  };
}

function assertSafeJsonBody(body: unknown) {
  const text = JSON.stringify(body);
  assert.equal(text.includes("sk_"), false);
  assert.equal(text.includes("pk_"), false);
  assert.equal(text.includes("CLERK_SECRET"), false);
  assert.equal(text.includes("user_abc"), false);
  assert.equal(text.includes("sess_"), false);
}

async function main() {
  console.log("\nSprint 11E Phase 2A.1 — Clerk authority hardening\n");

  // ——— Environment classification ———
  await test("env: neither key → unconfigured", () => {
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
          CLERK_SECRET_KEY: undefined,
        }),
      ),
      "unconfigured",
    );
    assert.equal(
      isClerkEnvironmentConfigured(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
          CLERK_SECRET_KEY: undefined,
        }),
      ),
      false,
    );
  });

  await test("env: only publishable / only secret → invalid", () => {
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc123",
          CLERK_SECRET_KEY: undefined,
        }),
      ),
      "invalid",
    );
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
          CLERK_SECRET_KEY: "sk_test_abc123",
        }),
      ),
      "invalid",
    );
  });

  await test("env: blanks and whitespace → invalid", () => {
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "   ",
          CLERK_SECRET_KEY: "sk_test_abc",
        }),
      ),
      "invalid",
    );
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc\n",
          CLERK_SECRET_KEY: "sk_test_abc",
        }),
      ),
      "invalid",
    );
  });

  await test("env: valid test and live pairs → configured", () => {
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_publishablevalue",
          CLERK_SECRET_KEY: "sk_test_secretvaluehere",
        }),
      ),
      "configured",
    );
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_publishablevalue",
          CLERK_SECRET_KEY: "sk_live_secretvaluehere",
        }),
      ),
      "configured",
    );
  });

  await test("env: mixed test/live → invalid", () => {
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_publishablevalue",
          CLERK_SECRET_KEY: "sk_live_secretvaluehere",
        }),
      ),
      "invalid",
    );
  });

  await test("env: arbitrary non-empty / oversized / hostile → invalid", () => {
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "not-a-clerk-key",
          CLERK_SECRET_KEY: "also-not-a-key",
        }),
      ),
      "invalid",
    );
    assert.equal(
      classifyClerkEnvironment(
        envBag({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
            "pk_test_" + "x".repeat(CLERK_ENV_KEY_MAX_LENGTH),
          CLERK_SECRET_KEY: "sk_test_abc",
        }),
      ),
      "invalid",
    );
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("env getter sk_live_leak");
        },
      },
    );
    assert.equal(classifyClerkEnvironment(hostile as never), "invalid");
  });

  // ——— Snapshot validator ———
  await test("snapshot: signed-out and pending distinguishable from malformed", () => {
    const signedOut = validateClerkAuthSnapshot({
      userId: null,
      sessionId: null,
      sessionStatus: null,
    });
    assert.equal(signedOut.ok, true);

    const pending = validateClerkAuthSnapshot({
      userId: "user_1",
      sessionId: "sess_1",
      sessionStatus: "pending",
    });
    assert.equal(pending.ok, true);

    assert.equal(
      validateClerkAuthSnapshot({
        userId: "user_1",
        sessionId: "sess_1",
      }).ok,
      false,
    );
    assert.equal(
      validateClerkAuthSnapshot({
        userId: "user_1",
        sessionId: "sess_1",
        sessionStatus: "active",
        token: "leak",
      }).ok,
      false,
    );
    assert.equal(
      validateClerkAuthSnapshot({
        userId: "user_1",
        sessionId: "sess_1",
        sessionStatus: "revoked",
      }).ok,
      false,
    );
  });

  // ——— Principal adapter taxonomy ———
  await test("adapter: authenticated / signed-out / pending / throw / malformed", async () => {
    const okAdapter = new ClerkHeadlessPrincipalAdapter(
      async () => ({
        userId: "user_abc",
        sessionId: "sess_xyz",
        sessionStatus: "active",
      }),
      () => "configured",
    );
    const ok = await okAdapter.resolvePrincipal(null);
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.ownerId, "user_abc");
      assert.equal("projectIds" in ok.value, false);
    }

    const signedOut = await new ClerkHeadlessPrincipalAdapter(
      async () => ({
        userId: null,
        sessionId: null,
        sessionStatus: null,
      }),
      () => "configured",
    ).resolvePrincipal(null);
    assert.equal(signedOut.ok, false);
    if (!signedOut.ok) {
      assert.equal(signedOut.issues[0]?.code, "UNAUTHENTICATED");
    }

    const pending = await new ClerkHeadlessPrincipalAdapter(
      async () => ({
        userId: "user_p",
        sessionId: "sess_p",
        sessionStatus: "pending",
      }),
      () => "configured",
    ).resolvePrincipal(null);
    assert.equal(pending.ok, false);
    if (!pending.ok) {
      assert.equal(pending.issues[0]?.code, "UNAUTHENTICATED");
    }

    const threw = await new ClerkHeadlessPrincipalAdapter(async () => {
      throw new Error("CLERK_SECRET_KEY=sk_live_leaked boom");
    }, () => "configured").resolvePrincipal(null);
    assert.equal(threw.ok, false);
    if (!threw.ok) {
      assert.equal(threw.issues[0]?.code, "AUTHENTICATION_FAILED");
      const msg = threw.issues[0]?.message ?? "";
      assert.equal(msg.includes("sk_live"), false);
      assert.equal(msg.includes("CLERK_SECRET"), false);
    }

    const malformed = await new ClerkHeadlessPrincipalAdapter(
      async () => ({ userId: "u", sessionId: "s" }),
      () => "configured",
    ).resolvePrincipal(null);
    assert.equal(malformed.ok, false);
    if (!malformed.ok) {
      assert.equal(malformed.issues[0]?.code, "AUTHENTICATION_FAILED");
    }

    const invalidEnv = await new ClerkHeadlessPrincipalAdapter(
      async () => ({
        userId: "user_abc",
        sessionId: "sess",
        sessionStatus: "active",
      }),
      () => "invalid",
    ).resolvePrincipal(null);
    assert.equal(invalidEnv.ok, false);
    if (!invalidEnv.ok) {
      assert.equal(invalidEnv.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
    }
  });

  await test("principal hostile/overlong/forbidden fields", () => {
    assert.equal(
      validateHeadlessAuthenticatedPrincipal({
        ownerId: "",
        sessionId: null,
      }).ok,
      false,
    );
    assert.equal(
      validateHeadlessAuthenticatedPrincipal({
        ownerId: "x".repeat(HEADLESS_MAX_ID_LENGTH + 1),
        sessionId: null,
      }).ok,
      false,
    );
    assert.equal(
      validateHeadlessAuthenticatedPrincipal({
        ownerId: "user_1",
        sessionId: null,
        projectIds: ["p"],
      }).ok,
      false,
    );
  });

  // ——— Owner-bound testing project authorization ———
  await test("test project auth: owner + project matrix", async () => {
    const auth = new TestHeadlessProjectAuthorizationAdapter({
      ownerId: "owner-a",
      allowedProjectIds: ["project-a"],
    });
    assert.equal(
      (await auth.assertProjectAccess(
        { ownerId: "owner-a", sessionId: null },
        "project-a",
      )).ok,
      true,
    );
    assert.equal(
      (await auth.assertProjectAccess(
        { ownerId: "owner-a", sessionId: null },
        "project-b",
      )).ok,
      false,
    );
    assert.equal(
      (await auth.assertProjectAccess(
        { ownerId: "owner-b", sessionId: null },
        "project-a",
      )).ok,
      false,
    );
    assert.equal(
      (await auth.assertProjectAccess(
        { ownerId: "owner-b", sessionId: null },
        "project-b",
      )).ok,
      false,
    );
    assert.throws(() => {
      new TestHeadlessProjectAuthorizationAdapter({
        ownerId: "  ",
        allowedProjectIds: ["p"],
      });
    });
    const mutableIds = ["project-a"];
    const frozenAuth = new TestHeadlessProjectAuthorizationAdapter({
      ownerId: "owner-a",
      allowedProjectIds: mutableIds,
    });
    mutableIds.push("project-evil");
    assert.equal(
      (await frozenAuth.assertProjectAccess(
        { ownerId: "owner-a", sessionId: null },
        "project-evil",
      )).ok,
      false,
    );

    const stack = composeTestHeadlessControlPlane({
      principal: { ownerId: "owner-bind", sessionId: "s" },
      authorizedProjectIds: ["p1"],
    });
    assert.ok(stack.service);
    const principal = new TestHeadlessPrincipalAdapter({
      ownerId: "owner-bind",
      sessionId: "s",
    });
    assert.equal("projectIds" in (principal as object), false);
  });

  await test("production project authorization remains unavailable", async () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
    assert.equal(prod.canCreateJob, false);
    const access = await prod.projectAuthorization.assertProjectAccess(
      { ownerId: "user_1", sessionId: "s" },
      "proj_1",
    );
    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
    }
  });

  // ——— Proxy containment ———
  await test("proxy: absent/invalid keys pass through; failures contained", async () => {
    const req = new NextRequest("http://localhost/api/headless-render/availability");
    const absent = await runHeadlessClerkProxy(req, {}, {
      classifyEnv: () => "unconfigured",
      loadClerkMiddleware: async () => {
        throw new Error("should not load");
      },
    });
    assert.equal(absent.status, 200);

    const invalid = await runHeadlessClerkProxy(req, {}, {
      classifyEnv: () => "invalid",
      loadClerkMiddleware: async () => {
        throw new Error("should not load sk_live_secret");
      },
    });
    assert.equal(invalid.status, 200);

    const constructFail = await runHeadlessClerkProxy(req, {}, {
      classifyEnv: () => "configured",
      loadClerkMiddleware: async () => {
        throw new Error("CLERK_SECRET_KEY=sk_live_boom");
      },
    });
    assert.equal(constructFail.status, 200);

    const execFail = await runHeadlessClerkProxy(req, {}, {
      classifyEnv: () => "configured",
      loadClerkMiddleware: async () => async () => {
        throw new Error("handler sk_test_leak");
      },
    });
    assert.equal(execFail.status, 200);

    const success = await runHeadlessClerkProxy(req, {}, {
      classifyEnv: () => "configured",
      loadClerkMiddleware: async () => async () =>
        new Response("ok", { status: 218 }),
    });
    assert.equal(success.status, 218);

    const undefinedRes = await runHeadlessClerkProxy(req, {}, {
      classifyEnv: () => "configured",
      loadClerkMiddleware: async () => async () => undefined,
    });
    assert.equal(undefinedRes.status, 200);

    assert.equal(
      existsSync(path.join(process.cwd(), "src/proxy.ts")),
      false,
      "active Clerk proxy must be absent",
    );
  });

  // ——— Route behavioral matrix (all families) ———
  await test("route families: missing config / signed-out / provider fail / authenticated", async () => {
    // Mutation A
    let readerCalls = 0;
    const mutA = await handleHeadlessRouteAuthResponse({
      kind: "mutation",
      gateFn: (input) =>
        gateHeadlessRouteAuth({
          ...input,
          compose: mockCompose({
            clerkConfigured: false,
            reader: async () => {
              readerCalls += 1;
              return {
                userId: "user_x",
                sessionId: "s",
                sessionStatus: "active",
              };
            },
          }),
        }),
    });
    assert.equal(mutA.status, 503);
    assert.equal(readerCalls, 0);
    const mutABody = await mutA.json();
    assert.equal(mutABody.code, "CONFIGURATION_UNAVAILABLE");
    assertSafeJsonBody(mutABody);

    // Availability A
    const avA = await handleHeadlessRouteAuthResponse({
      kind: "availability",
      gateFn: (input) =>
        gateHeadlessRouteAuth({
          ...input,
          compose: mockCompose({ clerkConfigured: false }),
        }),
    });
    assert.equal(avA.status, 200);
    assert.equal((await avA.json()).state, PRODUCTION_HEADLESS_UNAVAILABLE.state);

    // B — signed out
    const mutB = await handleHeadlessRouteAuthResponse({
      kind: "mutation",
      gateFn: (input) =>
        gateHeadlessRouteAuth({
          ...input,
          compose: mockCompose({
            clerkConfigured: true,
            reader: async () => ({
              userId: null,
              sessionId: null,
              sessionStatus: null,
            }),
          }),
        }),
    });
    assert.equal(mutB.status, 401);
    assert.equal((await mutB.json()).code, "UNAUTHENTICATED");

    const avB = await handleHeadlessRouteAuthResponse({
      kind: "availability",
      gateFn: (input) =>
        gateHeadlessRouteAuth({
          ...input,
          compose: mockCompose({
            clerkConfigured: true,
            reader: async () => ({
              userId: null,
              sessionId: null,
              sessionStatus: null,
            }),
          }),
        }),
    });
    assert.equal((await avB.json()).state, HEADLESS_AUTHENTICATION_REQUIRED.state);

    // D — provider failure → 503 not 401
    const mutD = await handleHeadlessRouteAuthResponse({
      kind: "mutation",
      gateFn: (input) =>
        gateHeadlessRouteAuth({
          ...input,
          compose: mockCompose({
            clerkConfigured: true,
            reader: async () => {
              throw new Error("sk_live_network_down");
            },
          }),
        }),
    });
    assert.equal(mutD.status, 503);
    const mutDBody = await mutD.json();
    assert.equal(mutDBody.code, "AUTHENTICATION_FAILED");
    assert.equal(mutDBody.error.includes("Sign in"), false);
    assertSafeJsonBody(mutDBody);

    const avD = await handleHeadlessRouteAuthResponse({
      kind: "availability",
      gateFn: (input) =>
        gateHeadlessRouteAuth({
          ...input,
          compose: mockCompose({
            clerkConfigured: true,
            reader: async () => {
              throw new Error("sk_live_network_down");
            },
          }),
        }),
    });
    assert.equal(
      (await avD.json()).state,
      HEADLESS_AUTH_TEMPORARILY_UNAVAILABLE.state,
    );

    // C — authenticated still config-blocked
    const mutC = await handleHeadlessRouteAuthResponse({
      kind: "mutation",
      gateFn: (input) =>
        gateHeadlessRouteAuth({
          ...input,
          compose: mockCompose({
            clerkConfigured: true,
            reader: async () => ({
              userId: "user_ok",
              sessionId: "sess_ok",
              sessionStatus: "active",
            }),
          }),
        }),
    });
    assert.equal(mutC.status, 503);
    assert.equal((await mutC.json()).code, "CONFIGURATION_UNAVAILABLE");

    const avC = await handleHeadlessRouteAuthResponse({
      kind: "availability",
      gateFn: (input) =>
        gateHeadlessRouteAuth({
          ...input,
          compose: mockCompose({
            clerkConfigured: true,
            reader: async () => ({
              userId: "user_ok",
              sessionId: "sess_ok",
              sessionStatus: "active",
            }),
          }),
        }),
    });
    const avCBody = await avC.json();
    assert.equal(avCBody.state, "configuration_unavailable");
    assert.equal(avCBody.canCreateJob, false);
    assertSafeJsonBody(avCBody);
  });

  await test("gate helpers: availability mapping + no principal leakage", async () => {
    const gateAuthFailed = await gateHeadlessRouteAuth({
      compose: mockCompose({
        clerkConfigured: true,
        reader: async () => null,
      }),
    });
    assert.equal(gateAuthFailed.kind, "authentication_failed");
    assert.equal(
      availabilityFromGate(gateAuthFailed).state,
      "temporarily_unavailable",
    );
    const json = jsonFromHeadlessRouteGate(gateAuthFailed);
    assert.equal(json.status, 503);
    assertSafeJsonBody(await json.json());
  });

  await test("import boundaries: Clerk only in proxy/server auth modules", () => {
    const prodIndex = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/index.ts",
      ),
      "utf8",
    );
    assert.equal(prodIndex.includes("TestHeadlessPrincipalAdapter"), false);
    assert.equal(
      prodIndex.includes("TestHeadlessProjectAuthorizationAdapter"),
      false,
    );

    const productFiles = [
      "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
      "src/features/headless-renderer/product/client/http-headless-render.client.ts",
      "src/components/ExportPanel.tsx",
    ];
    for (const rel of productFiles) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      assert.equal(src.includes("@clerk/nextjs"), false);
      assert.equal(src.includes("ClerkHeadlessPrincipalAdapter"), false);
    }

    const workerHit = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/local-worker-runner.ts",
      ),
      "utf8",
    );
    assert.equal(workerHit.includes("@clerk/nextjs"), false);

    const layout = readFileSync(
      path.join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );
    assert.equal(layout.includes("ClerkProvider"), false);

    const routes = [
      "availability/route.ts",
      "jobs/route.ts",
      "jobs/[jobId]/route.ts",
      "jobs/[jobId]/cancel/route.ts",
      "jobs/[jobId]/retry/route.ts",
      "jobs/[jobId]/download/route.ts",
    ];
    for (const rel of routes) {
      const src = readFileSync(
        path.join(process.cwd(), "src/app/api/headless-render", rel),
        "utf8",
      );
      assert.equal(src.includes("control-plane/testing"), false);
      assert.equal(src.includes("@clerk/nextjs"), false);
    }

    // Clerk import allowed only in known server modules
    const clerkPrincipal = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/clerk-principal.adapter.ts",
      ),
      "utf8",
    );
    assert.ok(clerkPrincipal.includes('@clerk/nextjs/server'));
    const clerkProxy = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/runtime/headless-clerk-proxy.ts",
      ),
      "utf8",
    );
    assert.ok(clerkProxy.includes('@clerk/nextjs/server'));
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
