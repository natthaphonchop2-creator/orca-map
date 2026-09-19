# Third-party notices

This repository contains a standalone ORCA workspace frontend, including portions
derived from the Obot UI and third-party packages/assets. Ownership and license
notices are preserved for those portions; this document does not relabel all ORCA
code, product design or branding as upstream software.

## Obot

- Upstream project: https://github.com/obot-platform/obot
- Copyright notice: Copyright © 2026 Obot AI, Inc
- License: MIT; complete original text in `licenses/Obot-MIT.txt`.
- Local import/base revision details: `licenses/README.md`.
- A browser-readable copy is also retained at
  `static/third-party/licenses/Obot-MIT.txt`.

The Go backend runs separately and is not bundled in this repository's Node
adapter. This source attribution records the inherited frontend portions.

## Frontend dependencies and assets

The retained notice reader is `static/third-party.html`. Its accompanying
`static/third-party/manifest.json`, license texts and source archives preserve the
notice snapshot shipped with the imported frontend. This is a preserved source
snapshot, not a claim that every listed package is used by the new app's final
browser bundle or that the new bundle has undergone a fresh complete license
audit. Keep the notices with redistributed assets and update the inventory when
dependencies or included assets change.

`pnpm-lock.yaml` retains the imported frontend dependency graph and matching
workspace overrides. The graph and static notice inventory were not regenerated
for this split. A successful fresh frozen-lock installation confirms those
package pins can be installed; it does not replace a bundle-level notice review.

The snapshot includes package-specific notices and preferred-source archives for
embedded components. Fonts, highlight assets and provider icons also retain
their adjacent notices, including `static/orca/tools/BRAND-NOTICE.txt` and its
source manifest. Provider names/icons identify their respective systems; their
presence does not establish a partnership, endorsement or completed integration.

At runtime `/third-party.html` and nested `/third-party/` paths serve only local
files included in this app build. The standalone adapter does not substitute
backend notices when a local file is absent. The inherited notice page's
`/third-party-runtime/` link refers to notices from the separate backend
distribution and is not a bundled Node-server notice endpoint here.
