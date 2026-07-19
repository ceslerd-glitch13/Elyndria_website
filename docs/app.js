const gallery = document.querySelector("#gallery");
const status = document.querySelector("#status");
const search = document.querySelector("#search");
const template = document.querySelector("#asset-template");
const assetCount = document.querySelector("#asset-count");
const storageUsed = document.querySelector("#storage-used");

let manifest = null;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function copyAssetId(assetId, button) {
  try {
    await navigator.clipboard.writeText(assetId);
    const original = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => { button.textContent = original; }, 1200);
  } catch {
    button.textContent = assetId;
  }
}

function render() {
  if (!manifest) return;
  const query = search.value.trim().toLowerCase();
  const assets = manifest.assets.filter((asset) => asset.id.toLowerCase().includes(query));
  gallery.replaceChildren();

  if (assets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = manifest.assets.length === 0
      ? "No token artwork has been processed yet."
      : "No asset IDs match that search.";
    gallery.append(empty);
  } else {
    for (const asset of assets) {
      const card = template.content.cloneNode(true);
      const image = card.querySelector("img");
      const code = card.querySelector("code");
      const size = card.querySelector(".asset-size");
      const button = card.querySelector("button");
      image.src = `./${asset.file}`;
      image.alt = `Public token artwork ${asset.id}`;
      code.textContent = asset.id;
      size.textContent = formatBytes(asset.bytes);
      button.addEventListener("click", () => copyAssetId(asset.id, button));
      gallery.append(card);
    }
  }

  status.textContent = query
    ? `Showing ${assets.length} of ${manifest.summary.assetCount} assets.`
    : `${manifest.summary.assetCount} public token assets available.`;
}

async function loadManifest() {
  try {
    const response = await fetch("./token-index.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Manifest request failed with ${response.status}`);
    manifest = await response.json();
    assetCount.textContent = `${manifest.summary.assetCount} / ${manifest.limits.maximumAssets}`;
    storageUsed.textContent = `${formatBytes(manifest.summary.totalBytes)} / ${formatBytes(manifest.limits.maximumTotalBytes)}`;
    render();
  } catch (error) {
    status.textContent = "The token index could not be loaded.";
    console.error(error);
  }
}

search.addEventListener("input", render);
loadManifest();
