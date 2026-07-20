# JPEG and PNG token-format test

This patch reuses the existing ten token artworks. Tests 01–05 are JPEG files and tests 06–10 are PNG files. No new artwork was generated.

## Apply to the repository

1. Remove the ten existing `.webp` files listed in `REMOVE_OLD_WEBP_FILES.txt` from the repository's top-level `docs/tokens/` directory.
2. Copy this patch's `docs/tokens/` contents into the repository's top-level `docs/tokens/` directory.
3. Replace `docs/token-index.json`, `scripts/process-tokens.mjs`, and `tests/process-tokens.test.mjs` with the corresponding files from this patch.
4. Commit all changes together and allow the token-processing workflow and GitHub Pages deployment to finish.
5. Open the battle map and press **Refresh**.

The processor change is required. The previous processor indexed only WebP files and would otherwise rebuild the manifest as empty.

## Test key

| Test | Creature | Format | Coded filename |
|---:|---|---|---|
| 01 | Goblin Scout | JPEG | `9dd94c4f0fa5e9bc045757e1.jpg` |
| 02 | Orc Berserker | JPEG | `648e34ae5578678f0244c734.jpg` |
| 03 | Skeleton Knight | JPEG | `58475d413eadd8dbe88d6ca2.jpg` |
| 04 | Green Slime | JPEG | `6bc5e2c42b9e3c631733006f.jpg` |
| 05 | Kobold Alchemist | JPEG | `300aa82d3b4e0616c5aa7c62.jpg` |
| 06 | Giant Spider | PNG | `24279bbb07a9c1f2d5127725.png` |
| 07 | Shadow Wolf | PNG | `5eb6b149144cdfc622afcc53.png` |
| 08 | Mimic Chest | PNG | `f87dc5f7422ab2079a19ba55.png` |
| 09 | Hooded Cultist | PNG | `7baf4852a9ae56053f193698.png` |
| 10 | Red Dragon Wyrmling | PNG | `2d26eaf5a1300a4de4767067.png` |

