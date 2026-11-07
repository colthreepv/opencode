# Personal build manifest

Agent instructions for the `personal` integration branch. This file belongs only to `personal`; do not add it to
`sidebar-pro`, the fork's default branch. Keep `README.md` identical to Sidebar Pro's README after final integration.

## Base

- Repository: `colthreepv/opencode`.
- Sidebar base: `sidebar-pro`, based on official OpenCode `v2.2.6` (`dc2ffcf8bf`), including the local
  `stable-conversations` feature.
- Never integrate `upstream/dev` wholesale. Advance the sidebar base only to an accepted stable V2 release.

## Patch queue

Upstream status checked on 2026-11-07. An open or rejected PR does not prevent using its patch here.

| Patch | Integration status | Upstream PR | Reference branch | Source commits |
| --- | --- | --- | --- | --- |
| Independent external-editor launches; report launch errors instead of falling back to Explorer | Included | [#62542](https://github.com/anomalyco/opencode/pull/62542), open | `origin/detach-editor` | `94adf06657`, `9faf3329f0` |
| File links navigate to and center the requested line; file-viewer word wrap control and icon | Included | [#62543](https://github.com/anomalyco/opencode/pull/62543), open | `origin/fix/go-to-codeline` | `dcc5b7c796`, `7c0954e04a` |

The listed source commits were cherry-picked in order onto v2.2.6 without merging their development bases. Prefer
scoped cherry-picks when a development base would add unrelated changes. Feature branch merges are allowed after
reviewing their net changes and testing the result.

Maintain `personal` by merging the accepted `sidebar-pro` and checking whether patches are already included before
applying them again. Retain this file, and update PR status and commit references whenever the patch set changes.
Do not change the fork's default branch.

## Verify and build

1. Use a clean checkout of `personal`, then `bun install --frozen-lockfile`.
2. Run `bun run check` at the repository root and relevant package tests from their package directories.
3. Push to `personal` to automatically build and publish the Windows x64 installer and Linux x64 AppImage/deb/rpm.
   The workflow can also be started manually:

   ```sh
   gh workflow run personal-desktop.yml --repo colthreepv/opencode --ref personal
   ```

The two build jobs use the same commit. Once both pass, the publish job creates the latest GitHub release,
`v<base>-personal.<build-number>`, with permanent packages, checksums and a combined manifest. CI artifacts are retained
for seven days. To retry publication without rebuilding, dispatch with `-f artifact_run=<successful-run-id>`.
The manifest records the exact source commit and upstream base. Installation remains manual.
Never stop, restart, replace or downgrade the user's running OpenCode app or background service while integrating patches.
