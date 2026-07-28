/**
 * Asset materialization verification
 * (run: npm run test:asset-materialization).
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as NodeModule;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MATERIALIZATION_ROOT = join(process.cwd(), "src/features/asset-materialization");
const PROVIDER_SDK_PATH = join(
  process.cwd(),
  "src/features/asset-search/providers/provider-sdk/provider-sdk.types.ts",
);

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, "base64");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

function buildPngResponse(): Response {
  return new Response(TINY_PNG_BYTES, {
    status: 200,
    headers: {
      "content-type": "image/png",
    },
  });
}

function collectMaterializationSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectMaterializationSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts") && entry !== "asset-materialization.client.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

async function runMaterializationTests() {
  const {
    buildAssetMaterializationCacheKey,
    getAssetMaterializationCacheSizeForTests,
    materializeAssetImage,
    resetAssetMaterializationCacheForTests,
    setMaterializationFetchForTests,
    setMaterializationMaxBytesForTests,
    setMaterializationTimeoutMsForTests,
  } = await import("@/features/asset-materialization");

  resetAssetMaterializationCacheForTests();
  setMaterializationFetchForTests(null);
  setMaterializationTimeoutMsForTests(null);
  setMaterializationMaxBytesForTests(null);

  await testAsync("successful materialization returns export-safe data URL", async () => {
    let fetchCalls = 0;
    setMaterializationFetchForTests(async () => {
      fetchCalls += 1;
      return buildPngResponse();
    });

    const result = await materializeAssetImage({
      providerId: "mock",
      previewUrl: "https://images.example.com/preview.png",
      fullResolutionUrl: "https://images.example.com/full.png",
      preferredResolution: "preview",
    });

    assert.equal(result.success, true);
    assert.equal(result.strategy, "data_url");
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.width, 1);
    assert.equal(result.height, 1);
    assert.match(result.playableUrl ?? "", /^data:image\/png;base64,/);
    assert.equal(fetchCalls, 1);
  });

  await testAsync("cache hit avoids duplicate fetch", async () => {
    resetAssetMaterializationCacheForTests();
    let fetchCalls = 0;
    setMaterializationFetchForTests(async () => {
      fetchCalls += 1;
      return buildPngResponse();
    });

    const request = {
      providerId: "mock" as const,
      previewUrl: "https://images.example.com/cache-preview.png",
      fullResolutionUrl: "https://images.example.com/cache-full.png",
      preferredResolution: "full" as const,
    };

    const first = await materializeAssetImage(request);
    const second = await materializeAssetImage(request);

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.cacheHit, true);
    assert.equal(fetchCalls, 1);
    assert.equal(getAssetMaterializationCacheSizeForTests(), 1);
  });

  await testAsync("invalid mime rejected when header and bytes disagree", async () => {
    resetAssetMaterializationCacheForTests();
    setMaterializationFetchForTests(async () =>
      new Response(TINY_PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );

    const result = await materializeAssetImage({
      providerId: "mock",
      previewUrl: "https://images.example.com/mime-mismatch.png",
      fullResolutionUrl: "https://images.example.com/mime-mismatch-full.png",
    });

    assert.equal(result.success, false);
    assert.equal(result.strategy, "unsupported");
    assert.match(result.error ?? "", /unsupported or invalid mime type/i);
  });

  await testAsync("timeout returns safe failure", async () => {
    resetAssetMaterializationCacheForTests();
    setMaterializationTimeoutMsForTests(25);
    setMaterializationFetchForTests((_url, init) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        const timer = setTimeout(() => resolve(buildPngResponse()), 200);

        if (signal?.aborted) {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted", "AbortError"));
          return;
        }

        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      }),
    );

    const result = await materializeAssetImage({
      providerId: "mock",
      previewUrl: "https://images.example.com/slow.png",
      fullResolutionUrl: "https://images.example.com/slow-full.png",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /timed out/i);
  });

  await testAsync("oversized image rejected", async () => {
    resetAssetMaterializationCacheForTests();
    setMaterializationMaxBytesForTests(128);
    setMaterializationFetchForTests(async () =>
      new Response(TINY_PNG_BYTES, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(TINY_PNG_BYTES.length + 512),
        },
      }),
    );

    const result = await materializeAssetImage({
      providerId: "mock",
      previewUrl: "https://images.example.com/oversized.png",
      fullResolutionUrl: "https://images.example.com/oversized-full.png",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /maximum size/i);
  });

  await testAsync("unsupported format rejected", async () => {
    resetAssetMaterializationCacheForTests();
    setMaterializationFetchForTests(async () =>
      new Response("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );

    const result = await materializeAssetImage({
      providerId: "mock",
      previewUrl: "https://images.example.com/vector.svg",
      fullResolutionUrl: "https://images.example.com/vector-full.svg",
    });

    assert.equal(result.success, false);
    assert.equal(result.strategy, "unsupported");
    assert.match(result.error ?? "", /unsupported or invalid mime type/i);
  });

  test("deterministic cache key uses provider, full URL, and resolution", () => {
    const keyA = buildAssetMaterializationCacheKey({
      providerId: "pexels",
      fullResolutionUrl: "https://images.example.com/full.png",
      preferredResolution: "full",
    });
    const keyB = buildAssetMaterializationCacheKey({
      providerId: "pexels",
      fullResolutionUrl: "https://images.example.com/full.png",
      preferredResolution: "full",
    });
    const keyC = buildAssetMaterializationCacheKey({
      providerId: "pexels",
      fullResolutionUrl: "https://images.example.com/full.png",
      preferredResolution: "preview",
    });

    assert.equal(keyA, keyB);
    assert.notEqual(keyA, keyC);
    assert.equal(keyA.length, createHash("sha256").digest("hex").length);
  });

  test("materialization module has no editor imports", () => {
    const sources = collectMaterializationSources(MATERIALIZATION_ROOT);
    assert.ok(sources.length >= 4);

    const forbidden = [
      /@\/features\/editor\//,
      /CreatorAssetStudio/,
      /AssetBrowser/,
      /useSceneImageUpload/,
    ];

    for (const filePath of sources) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbidden) {
        assert.doesNotMatch(source, pattern, `${filePath} must not import editor modules`);
      }
    }
  });

  test("materialization module has no attach imports", () => {
    const sources = collectMaterializationSources(MATERIALIZATION_ROOT);
    const forbidden = [/@\/features\/asset-attach/, /attachNormalizedAssetToScene/];

    for (const filePath of sources) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of forbidden) {
        assert.doesNotMatch(source, pattern, `${filePath} must not import attach layer`);
      }
    }
  });

  test("provider SDK source is unchanged by materialization work", () => {
    const providerSdkSource = readFileSync(PROVIDER_SDK_PATH, "utf8");
    assert.doesNotMatch(providerSdkSource, /asset-materialization/);
    assert.match(providerSdkSource, /ASSET_SEARCH_PROVIDER_SDK_VERSION/);
  });
}

console.log("asset-materialization");

void runMaterializationTests()
  .then(async () => {
    const { resetAssetMaterializationCacheForTests, setMaterializationFetchForTests, setMaterializationMaxBytesForTests, setMaterializationTimeoutMsForTests } =
      await import("@/features/asset-materialization");
    resetAssetMaterializationCacheForTests();
    setMaterializationFetchForTests(null);
    setMaterializationTimeoutMsForTests(null);
    setMaterializationMaxBytesForTests(null);
    console.log("asset-materialization passed");
  })
  .catch(async (error: unknown) => {
    const { resetAssetMaterializationCacheForTests, setMaterializationFetchForTests, setMaterializationMaxBytesForTests, setMaterializationTimeoutMsForTests } =
      await import("@/features/asset-materialization");
    resetAssetMaterializationCacheForTests();
    setMaterializationFetchForTests(null);
    setMaterializationTimeoutMsForTests(null);
    setMaterializationMaxBytesForTests(null);
    console.error(error);
    process.exit(1);
  });
