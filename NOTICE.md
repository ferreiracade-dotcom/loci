# Third-party content notice

Loci bundles third-party content under `resources/`. Provenance and license status are listed here; "unconfirmed" means the license has not been verified.

## Scripture (`resources/scripture/`)

| Content | Source | License status |
| --- | --- | --- |
| Berean Standard Bible text (`BSB.json`) | Berean Bible Translation Committee, bereanbible.com | Dedicated to the public domain (2023) by the committee |
| BSB tables / interlinear (`interlinear/`) | Berean Bible Translation Committee, bereanbible.com | Dedicated to the public domain (2023) by the committee |
| Berean Literal Bible, draft (`BLB.json`) | literalbible.com | Source file header states it is dedicated to the public domain |
| BSB topical index (`topics.json`) | Source xlsx from bereanbible.com | **Unconfirmed.** The xlsx states no license. The converter header (`tools/bsb-topics-to-json.mjs`) says the index merges Torrey's, Nave's, OpenBible.info and BibleHub topics. OpenBible.info topical data is typically CC BY; attribution to OpenBible.info is given here. Its redistribution terms, and those of the other sources, must be confirmed before release. (The converter header's "public domain" wording is not verified.) |

BSB audio is not bundled; it is fetched at runtime from a third-party service.

## Other bundled resources

| Folder | Status |
| --- | --- |
| `resources/commentaries/` | See audit pending |
| `resources/dogmatics/` | See audit pending |
| `resources/fathers/` | See audit pending |

No license is asserted for these folders until the audit is complete.
