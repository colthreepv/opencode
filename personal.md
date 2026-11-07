# Personal build manifest

Agent instructions for the `personal` integration branch. This file belongs only to `personal`; do not add it to
`sidebar-pro`, the fork's default branch. Keep `README.md` identical to Sidebar Pro's README.

## Base

- Repository: `colthreepv/opencode`.
- Sidebar base: `sidebar-pro` (currently official OpenCode `v2.2.5`; see `.github/sidebar/config.json`).
- Never integrate `upstream/dev` wholesale. Advance the sidebar base only to an accepted stable V2 release.

## Patch queue

Upstream status checked on 2026-11-07. An open or rejected PR does not prevent using its patch here.

| Patch | Integration status | Upstream PR | Reference branch | Source commits |
| --- | --- | --- | --- | --- |
| Independent external-editor launches; report launch errors instead of falling back to Explorer | Included | [#62542](https://github.com/anomalyco/opencode/pull/62542), open | `origin/detach-editor` | `94adf06657`, `9faf3329f0` |
| File links navigate to and center the requested line; file-viewer word wrap control and icon | Pending accepted v2.2.6 base: requires the upstream file-scroll machine absent from v2.2.5 | [#62543](https://github.com/anomalyco/opencode/pull/62543), open | `origin/fix/go-to-codeline` | `dcc5b7c796`, `7c0954e04a` |

Apply the listed commits in order with `git cherry-pick -x`; do not merge the entire reference branches, which track
upstream development. Check whether the accepted stable base already includes a patch before applying it again.
When advancing `personal`, replay only its integration commits onto the accepted `sidebar-pro` tip and retain this file.
Update PR status and commit references whenever the patch set changes. Do not change the fork's default branch.

## Verify and build

1. Use a clean checkout of `personal`, then `bun install --frozen-lockfile`.
2. Run `bun run check` at the repository root and relevant package tests from their package directories.
3. Build the Windows ZIP through the existing workflow, explicitly selecting this branch:

   ```sh
   gh workflow run sidebar-windows.yml --repo colthreepv/opencode --ref personal
   ```

The artifact manifest records the exact source commit and upstream base. Do not publish or install automatically.
Never stop, restart, replace or downgrade the user's running OpenCode app or background service while integrating patches.
