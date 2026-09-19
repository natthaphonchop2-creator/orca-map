# Source provenance

The workspace frontend was separated from the existing local ORCA/Obot project
on 2026-09-17. Its import source was `../khum-obot/ui/user`, including selected
frontend components, service clients, stores, login/auth routes, styles and public
assets needed by the workspace. The public marketing route set was excluded.

The frontend dependency graph was carried over in `pnpm-lock.yaml` with its
matching public `pnpm-workspace.yaml` overrides/build policy. It was not
re-resolved or regenerated during this separation. A fresh frozen-lock install
was verified separately; that check validates installation of the retained
graph, not a new inventory of dependencies actually bundled into the app.

The original project's Git base revision at import was
`684b85291510a8674a465af4eb2fda585ab1d2be`, with upstream remote
`https://github.com/obot-platform/obot.git`. The local source checkout also
contained ORCA-specific changes beyond that base; this repository is not claimed
to be an unchanged copy of that upstream revision.

`Obot-MIT.txt` preserves the complete copyright/license text read from that
project's root `LICENSE`. It applies to the inherited Obot software according to
its terms. It does not label ORCA-specific code, designs, branding or the newly
written Node adapter as an upstream Obot product, and it does not assign a new
license to those separate contributions.

Third-party package, font and embedded-component notices accompanying the
imported frontend are retained under `static/third-party/`, with a reader at
`static/third-party.html`. Individual asset notices remain next to their assets.
See `../THIRD_PARTY_NOTICES.md` for the notice inventory and scope.
