import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { POLICY, processTokenAssets } from "../scripts/process-tokens.mjs";

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "elyndria-token-assets-"));
  await mkdir(path.join(root, "incoming"), { recursive: true });
  await mkdir(path.join(root, "docs", "tokens"), { recursive: true });
  return root;
}

test("converts a source image into one compliant token and manifest entry", async () => {
  const root = await fixtureRoot();
  const sourcePath = path.join(root, "incoming", "source.png");
  await sharp({
    create: { width: 900, height: 500, channels: 4, background: { r: 120, g: 45, b: 35, alpha: 1 } }
  }).png().toFile(sourcePath);

  const result = await processTokenAssets({ root });
  assert.equal(result.processedSources, 1);
  assert.equal(result.createdAssets.length, 1);
  assert.equal(result.manifest.summary.assetCount, 1);

  const outputPath = path.join(root, "docs", "tokens", `${result.createdAssets[0]}.webp`);
  const metadata = await sharp(outputPath).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, POLICY.width);
  assert.equal(metadata.height, POLICY.height);
  assert.ok((await stat(outputPath)).size <= POLICY.maximumAssetBytes);
  assert.deepEqual(await readdir(path.join(root, "incoming")), []);
});

test("deduplicates equivalent converted artwork", async () => {
  const root = await fixtureRoot();
  const bytes = await sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 20, g: 90, b: 120 } }
  }).jpeg().toBuffer();
  await writeFile(path.join(root, "incoming", "one.jpg"), bytes);
  await writeFile(path.join(root, "incoming", "two.jpg"), bytes);

  const result = await processTokenAssets({ root });
  assert.equal(result.processedSources, 2);
  assert.equal(result.createdAssets.length, 1);
  assert.equal(result.duplicateAssets.length, 1);
  assert.equal(result.manifest.summary.assetCount, 1);
});

test("rejects oversized source files without deleting them", async () => {
  const root = await fixtureRoot();
  const sourcePath = path.join(root, "incoming", "oversized.png");
  await writeFile(sourcePath, Buffer.alloc(POLICY.maximumSourceBytes + 1));

  await assert.rejects(() => processTokenAssets({ root }), /source limit/);
  assert.equal((await stat(sourcePath)).size, POLICY.maximumSourceBytes + 1);
  assert.deepEqual(await readdir(path.join(root, "docs", "tokens")), []);
});

test("rebuilds the manifest when no incoming images exist", async () => {
  const root = await fixtureRoot();
  const result = await processTokenAssets({ root });
  assert.equal(result.processedSources, 0);
  assert.equal(result.manifest.summary.assetCount, 0);
  const manifest = JSON.parse(await readFile(path.join(root, "docs", "token-index.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.summary.totalBytes, 0);
});


test("indexes compliant JPEG and PNG assets without converting them", async () => {
  const root = await fixtureRoot();
  const tokensDirectory = path.join(root, "docs", "tokens");
  const jpeg = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 100, g: 30, b: 20 } }
  }).jpeg().toBuffer();
  const png = await sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 20, g: 80, b: 120, alpha: 1 } }
  }).png().toBuffer();
  const jpegId = createHash("sha256").update(jpeg).digest("hex").slice(0, 24);
  const pngId = createHash("sha256").update(png).digest("hex").slice(0, 24);
  await writeFile(path.join(tokensDirectory, `${jpegId}.jpg`), jpeg);
  await writeFile(path.join(tokensDirectory, `${pngId}.png`), png);

  const result = await processTokenAssets({ root });
  assert.equal(result.manifest.summary.assetCount, 2);
  assert.deepEqual(result.manifest.limits.formats, ["jpeg", "png"]);
  assert.equal(result.manifest.limits.format, "mixed");
  assert.deepEqual(result.manifest.assets.map((asset) => asset.format).sort(), ["jpeg", "png"]);
});

test("preserves a valid stable asset ID when replacement artwork changes", async () => {
  const root = await fixtureRoot();
  const tokensDirectory = path.join(root, "docs", "tokens");
  const stableId = "0123456789abcdef01234567";
  const replacement = await sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 70, g: 40, b: 120, alpha: 0.8 } }
  }).webp().toBuffer();
  const digest = createHash("sha256").update(replacement).digest("hex");
  assert.notEqual(digest.slice(0, 24), stableId);
  await writeFile(path.join(tokensDirectory, `${stableId}.webp`), replacement);

  const result = await processTokenAssets({ root });
  assert.equal(result.manifest.summary.assetCount, 1);
  assert.equal(result.manifest.assets[0].id, stableId);
  assert.equal(result.manifest.assets[0].file, `tokens/${stableId}.webp`);
  assert.equal(result.manifest.assets[0].sha256, digest);
  assert.equal(result.manifest.assets[0].bytes, replacement.length);
});
