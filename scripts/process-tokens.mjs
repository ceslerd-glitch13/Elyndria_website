import { createHash } from "node:crypto";
import { readdir, readFile, stat, unlink, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const POLICY = Object.freeze({
  maximumSourceBytes: 10 * 1024 * 1024,
  maximumAssetBytes: 150 * 1024,
  maximumAssets: 250,
  maximumTotalBytes: 25 * 1024 * 1024,
  width: 256,
  height: 256,
  format: "webp"
});

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const allowedFormats = new Set(["jpeg", "png", "webp"]);
const ignoredIncomingNames = new Set([".gitkeep", "README.md"]);
const qualitySteps = [80, 72, 64, 56];

function contentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function convertSource(sourcePath) {
  const sourceStats = await stat(sourcePath);
  if (!sourceStats.isFile()) throw new Error("is not a regular file");
  if (sourceStats.size === 0) throw new Error("is empty");
  if (sourceStats.size > POLICY.maximumSourceBytes) {
    throw new Error(`exceeds the ${POLICY.maximumSourceBytes} byte source limit`);
  }

  const extension = path.extname(sourcePath).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error("is not a supported JPG, PNG, or WebP image");

  const metadata = await sharp(sourcePath, { failOn: "error", limitInputPixels: 100_000_000 }).metadata();
  if (!allowedFormats.has(metadata.format)) throw new Error("has an unsupported decoded image format");
  if (!metadata.width || !metadata.height) throw new Error("does not contain valid image dimensions");

  let output = null;
  for (const quality of qualitySteps) {
    output = await sharp(sourcePath, { failOn: "error", limitInputPixels: 100_000_000 })
      .rotate()
      .resize(POLICY.width, POLICY.height, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: false
      })
      .webp({ quality, alphaQuality: quality, effort: 5 })
      .toBuffer();
    if (output.length <= POLICY.maximumAssetBytes) break;
  }

  if (!output || output.length > POLICY.maximumAssetBytes) {
    throw new Error(`could not be reduced below ${POLICY.maximumAssetBytes} bytes`);
  }
  return output;
}

async function existingTokenFiles(tokensDirectory) {
  const entries = await readdir(tokensDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".webp"))
    .map((entry) => entry.name)
    .sort();
}

async function buildManifest(tokensDirectory) {
  const files = await existingTokenFiles(tokensDirectory);
  const assets = [];

  for (const filename of files) {
    const assetPath = path.join(tokensDirectory, filename);
    const bytes = await readFile(assetPath);
    const digest = contentHash(bytes);
    const id = path.basename(filename, ".webp");
    if (id !== digest.slice(0, 24)) {
      throw new Error(`${filename} does not match its content-derived asset ID`);
    }
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    if (metadata.format !== "webp" || metadata.width !== POLICY.width || metadata.height !== POLICY.height) {
      throw new Error(`${filename} is not a compliant ${POLICY.width} x ${POLICY.height} WebP asset`);
    }
    if (bytes.length > POLICY.maximumAssetBytes) {
      throw new Error(`${filename} exceeds the converted asset limit`);
    }
    assets.push({
      id,
      file: `tokens/${filename}`,
      bytes: bytes.length,
      sha256: digest
    });
  }

  const totalBytes = assets.reduce((total, asset) => total + asset.bytes, 0);
  if (assets.length > POLICY.maximumAssets) throw new Error(`library exceeds ${POLICY.maximumAssets} assets`);
  if (totalBytes > POLICY.maximumTotalBytes) throw new Error(`library exceeds ${POLICY.maximumTotalBytes} bytes`);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    limits: {
      maximumAssets: POLICY.maximumAssets,
      maximumTotalBytes: POLICY.maximumTotalBytes,
      maximumAssetBytes: POLICY.maximumAssetBytes,
      width: POLICY.width,
      height: POLICY.height,
      format: POLICY.format
    },
    summary: {
      assetCount: assets.length,
      totalBytes
    },
    assets
  };
}

export async function processTokenAssets({ root = DEFAULT_ROOT } = {}) {
  const incomingDirectory = path.join(root, "incoming");
  const tokensDirectory = path.join(root, "docs", "tokens");
  const manifestPath = path.join(root, "docs", "token-index.json");
  await mkdir(incomingDirectory, { recursive: true });
  await mkdir(tokensDirectory, { recursive: true });

  const incomingEntries = await readdir(incomingDirectory, { withFileTypes: true });
  const candidates = incomingEntries
    .filter((entry) => entry.isFile() && !ignoredIncomingNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  const prepared = [];
  const errors = [];
  for (const filename of candidates) {
    const sourcePath = path.join(incomingDirectory, filename);
    try {
      const bytes = await convertSource(sourcePath);
      const digest = contentHash(bytes);
      prepared.push({
        sourcePath,
        assetId: digest.slice(0, 24),
        digest,
        bytes
      });
    } catch (error) {
      errors.push(`${filename}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Token processing stopped:\n- ${errors.join("\n- ")}`);
  }

  const currentFiles = await existingTokenFiles(tokensDirectory);
  const prospective = new Map();
  for (const filename of currentFiles) {
    const filePath = path.join(tokensDirectory, filename);
    prospective.set(filename, (await stat(filePath)).size);
  }
  for (const item of prepared) prospective.set(`${item.assetId}.webp`, item.bytes.length);

  const prospectiveBytes = [...prospective.values()].reduce((total, bytes) => total + bytes, 0);
  if (prospective.size > POLICY.maximumAssets) {
    throw new Error(`Upload would exceed the ${POLICY.maximumAssets}-asset library limit`);
  }
  if (prospectiveBytes > POLICY.maximumTotalBytes) {
    throw new Error(`Upload would exceed the ${POLICY.maximumTotalBytes}-byte library limit`);
  }

  const writtenAssetIds = [];
  const duplicateAssetIds = [];
  for (const item of prepared) {
    const filename = `${item.assetId}.webp`;
    const outputPath = path.join(tokensDirectory, filename);
    if (currentFiles.includes(filename) || writtenAssetIds.includes(item.assetId)) {
      duplicateAssetIds.push(item.assetId);
    } else {
      await writeFile(outputPath, item.bytes, { flag: "wx" });
      writtenAssetIds.push(item.assetId);
    }
  }

  for (const item of prepared) await unlink(item.sourcePath);

  const manifest = await buildManifest(tokensDirectory);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    processedSources: prepared.length,
    createdAssets: writtenAssetIds,
    duplicateAssets: duplicateAssetIds,
    manifest
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const result = await processTokenAssets();
    console.log(`Processed ${result.processedSources} source image(s).`);
    console.log(`Created ${result.createdAssets.length} unique token asset(s).`);
    console.log(`Detected ${result.duplicateAssets.length} duplicate upload(s).`);
    console.log(`Library: ${result.manifest.summary.assetCount} assets, ${result.manifest.summary.totalBytes} bytes.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
