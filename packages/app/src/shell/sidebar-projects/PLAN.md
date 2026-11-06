# Projects sidebar (fork feature)

Fork: `colthreepv/opencode`, branch `sidebar-projects`, rebased onto every upstream release tag
(`upstream` = `anomalyco/opencode`). Started from `v2.2.5`.

A fourth interface mode, **Projects**, beside Top tabs / Side tabs / Inbox: a Codex-style project tree on top
and a Dock with live session state at the bottom.

## Glossary (use these names in code)

```
SidebarProjects                 the whole sidebar (interface mode "projects")
├─ ProjectTree                  top area, scrollable
│   └─ ProjectGroup             user-defined, just a name; collapsible; draggable
│       └─ ProjectRow           glyph + color + name; draggable within/between groups; drop target for sessions
│           └─ SessionRow       draggable onto another ProjectRow (session.move); 5 shown, then "Show more"
└─ Dock                         bottom area, at most 50% of the sidebar height
    ├─ DockHandle               drag to resize, clamped
    ├─ NeedsAttention           collapsible: inbox status approval | input | failed | done
    └─ Ongoing                  permanent, never collapsible, at the very bottom: inbox status working
```

Sessions with inbox status `ready` (seen) appear only in the ProjectTree.

## Upstream touch points (keep this list short; it is the rebase surface)

1. `settings/model.tsx` — add `"projects"` to `tabLayout` literals.
2. `settings/general/interface-mode.tsx` — add the mode + `ProjectsPreview`.
3. `shell/titlebar/titlebar.tsx` (~L866) — `<Show inbox>` becomes a `<Switch>` with a `projects` case.
4. `runtime/i18n/en.ts` — `sidebar.projects.*` and `settings.general.row.interfaceMode.projects*` keys (English only).

Everything else lives in `shell/sidebar-projects/`.

## Reused upstream pieces

- `createSessionInbox()` (`shell/titlebar/inbox-model.ts`): per-session status, `open`, `markViewed`, `decide`,
  `archive`. The Dock does not reimplement status logic.
- `ctx.projects.used()` / `forSession()` (`runtime/server/runtime.tsx`): projects this client uses, session→project.
- `ProjectIcon` / `icon.color` (`shell/layout/project-icon.tsx`, server `PATCH /api/project/{id}`): color stays
  server-side and shared with other modes. `icon.override` is an image data URL, so glyphs do not go there.
- `persisted(Persist.global(...))` (`runtime/persistence/storage`): client-local state.
- `@dnd-kit/solid` 0.5 (as in `shell/titlebar/tab-strip.tsx`, `session/composer/queue-panel.tsx`).
- Server: `POST /api/session/{id}/move { directory, delivery: "steer" | "queue" }`.

## Client state — `Persist.global("sidebar-projects")`

- `groups: { id, name, collapsed }[]` (ordered)
- `placement: Record<projectKey, { group: string; order: number }>` — `projectKey = server \0 pathKey(worktree)`
  (`projectKey()` in `state.tsx`). Not the project ID: one path can carry several IDs over time, and projects
  without a root commit all share the `global` ID.
- `glyphs: Record<projectKey, { kind: "icon"; name: string } | { kind: "emoji"; value: string }>`
- `expanded: Record<projectKey, true>`, `shown: Record<projectKey, number>` (Show more)
- `dock: { height?: number; attentionCollapsed: boolean }`

Projects without placement render in an implicit trailing "Ungrouped" group (its heading shows only once user
groups exist; it is not collapsible).

## Files

- `sidebar-projects.tsx` — `SidebarProjects`, wraps everything in `SidebarProjectsProvider`.
- `state.tsx` — persisted store + actions (`createSidebarProjectsState`), `projectKey`, and the context
  `useSidebarProjects()` → `{ state, inbox }`: one store and one `createSessionInbox()` shared by tree and dock.
- `project-tree.tsx` — `ProjectTree`, `ProjectGroup`, `ProjectRow`, `ProjectSessions` (Show more).
- `session-row.tsx` — `SessionRow` (status mark: ActivityRing working, warning dot approval/input, danger dot failed,
  accent dot unread done).
- `dock.tsx` — `Dock` (Phase 4 owner).
- `preview.tsx` / `preview.css` — Settings > Interface preview (`SidebarProjectsPreview`), so `interface-mode.tsx`
  only gains the mode entry and one `<Match>`.

## Phases

0. Fork, build, dev loop (web: `bun dev serve --port 4096` at root + `bun dev -- --port 4444` in `packages/app`). ✅
1. Mode wiring + module skeleton + store + ProjectTree (projects, sessions, Show more, open session). ✅
2. Groups: create / rename / delete; drag projects to reorder and between groups.
3. Glyphs: picker (curated Lucide subset, vendored SVG, `currentColor`) + emoji; color via existing `icon.color`.
4. Dock: Ongoing + NeedsAttention, DockHandle, 50% cap, collapse, `markViewed` on open.
5. Session drag across projects via `session.move` (confirm `queue`/`steer` while running; same server only).
6. Polish: keyboard nav, context menus, Windows package, rebase script.

## Multi-server

Projects of every visible server are listed (as Inbox does), so groups may mix servers. Session moves are same-server only.

## Desktop build

Windows x64, unsigned, alongside the official desktop:

```powershell
& "$HOME\bin\opencode-fork-build.ps1"
# Source-controlled copy: packages/desktop/script/fork-build.ps1
# Output: dist/desktop/app/OpenCode Dev.exe (keep the entire app directory)
```

The helper copies the installed official `resources/opencode-cli.exe` into
`packages/cli/dist/cli-windows-x64-baseline/bin/opencode.exe`, writes its actual version to the package
manifest, then runs desktop `build` and `pack`. It never launches the app or operates the service.
Build dependencies must already be installed (`bun install` at the repository root).

The desktop uses channel `dev`: **OpenCode Dev**, app ID/userData `ai.opencode.desktop.dev`, separate
from the installed official app. Its displayed version is `<installed-cli-version>-sidebar`; the bundled
CLI version stays the unmodified installed version (initially `2.2.5`). This suffix identifies the fork
without inventing a CLI version. The dev updater is disabled, so an official dev update cannot replace it.

Non-isolated dev startup/reconnect has no required service version and never does the version-forcing
retry. When `service.json` exists, it only discovers the service, without `ensure()`'s unresponsive-service
recovery or terminal handoff side effects. An unavailable registered service causes connection failure,
not replacement. With no registration it may start the bundled official CLI. Both clients share the real
service/data; client-local preferences, tabs and project selections remain separate. Open projects in this
client as needed; choose **Settings > General > Interface mode > Projects**.

If the official app advances to `2.2.6`, the fork still attaches without downgrading/restarting its service.
Client/API incompatibility remains possible: rebase onto that release and rebuild to update renderer and
bundled fallback CLI. If no service is registered, an old fork can start its bundled old CLI; rebuild before
using that fallback after an official update. Do not use service stop/restart to test this build.

## Rebase on release

```
git fetch upstream --tags
git rebase --onto vX.Y.Z <previous-base-tag> sidebar-projects
```
