# Elyndria Token Assets

This repository is the public, storage-efficient token-image library for the Elyndria battle map.

You upload ordinary JPG, PNG, or WebP artwork into `incoming/`. GitHub Actions then:

1. Verifies the file type and input size.
2. Strips metadata and orientation data.
3. Center-crops the artwork to a square.
4. Converts it to a 256 x 256 WebP token.
5. Uses a content hash as the public filename.
6. Removes duplicate images.
7. Enforces the 250-image and 25 MB library limits.
8. Rebuilds `docs/token-index.json` for the campaign site.
9. Deletes the uploaded original after successful conversion.

The repository intentionally does **not** store enemy names, statistics, assignments, quests, or other campaign secrets. The artwork and its opaque asset ID are public.

## First-time setup

1. Create a new **public** GitHub repository. `elyndria-token-assets` is the recommended name.
2. Upload every file and folder from this package into the repository's default `main` branch.
3. Open **Settings > Actions > General** and make sure GitHub Actions are allowed.
4. Open **Settings > Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch `main`, folder `/docs`, and save.
7. Open the **Actions** tab and confirm that `Process token images` is available.

GitHub Pages will publish a URL similar to:

```text
https://YOUR-USERNAME.github.io/elyndria-token-assets/
```

After the repository and Pages site are available, provide the repository URL and Pages URL so the campaign site can be connected to this library.

## Adding token images

1. Open the `incoming` folder on GitHub.
2. Choose **Add file > Upload files**.
3. Upload one or more JPG, PNG, or WebP images.
4. Commit the upload to `main`.
5. Open the **Actions** tab and wait for `Process token images` to complete.

Successful originals are removed automatically. Converted files appear under `docs/tokens/`, and the public gallery updates shortly afterward.

The source image may be as large as 10 MB, but the resulting stored token can never exceed 150 KB.

## Removing token images

Delete the desired `.webp` file from `docs/tokens/`. The automation will rebuild the public index. Before deleting an image, remove its assignments from the campaign site so affected tokens do not fall back unexpectedly.

## Public gallery and manifest

- Gallery: the GitHub Pages URL.
- Manifest: `token-index.json` at the GitHub Pages URL.
- Image paths: `tokens/ASSET-ID.webp` relative to the Pages URL.

The campaign site should retrieve the manifest on its server, not expose the full manifest through the player interface. Players should receive an image URL only for a token they are currently permitted to see.

## Storage policy

| Rule | Limit |
| --- | ---: |
| Accepted source types | JPG, PNG, WebP |
| Maximum source image | 10 MB |
| Converted dimensions | 256 x 256 pixels |
| Converted format | WebP |
| Maximum converted image | 150 KB |
| Maximum unique images | 250 |
| Maximum converted library | 25 MB |

See `ASSET_POLICY.md` for public-content and artwork requirements.

## If the automation cannot commit

On some organization-managed repositories, workflow write access can be restricted. Open **Settings > Actions > General > Workflow permissions**, select **Read and write permissions**, and save. Personal repositories normally accept the workflow's included `contents: write` permission without additional configuration.

## Local verification for advanced users

```bash
npm ci
npm test
npm run process-tokens
```

Node.js 22 or newer is required for local processing. GitHub supplies the required environment automatically when using the normal upload workflow.
