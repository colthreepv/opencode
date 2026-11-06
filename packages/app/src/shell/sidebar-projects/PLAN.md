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
- `placement: Record<projectKey, { group: string; order: number }>` — `projectKey = server \0 projectID`
- `glyphs: Record<projectKey, { kind: "icon"; name: string } | { kind: "emoji"; value: string }>`
- `expanded: Record<projectKey, true>`, `shown: Record<projectKey, number>` (Show more)
- `dock: { height?: number; attentionCollapsed: boolean }`

Projects without placement render in an implicit trailing "Ungrouped" group.

## Phases

0. Fork, build, dev loop (web: `bun dev serve --port 4096` at root + `bun dev -- --port 4444` in `packages/app`). ✅
1. Mode wiring + module skeleton + store + ProjectTree (projects, sessions, Show more, open session).
2. Groups: create / rename / delete; drag projects to reorder and between groups.
3. Glyphs: picker (curated Lucide subset, vendored SVG, `currentColor`) + emoji; color via existing `icon.color`.
4. Dock: Ongoing + NeedsAttention, DockHandle, 50% cap, collapse, `markViewed` on open.
5. Session drag across projects via `session.move` (confirm `queue`/`steer` while running; same server only).
6. Polish: keyboard nav, context menus, Windows package, rebase script.

## Multi-server

Projects of every visible server are listed (as Inbox does), so groups may mix servers. Session moves are same-server only.

## Rebase on release

```
git fetch upstream --tags
git rebase --onto vX.Y.Z <previous-base-tag> sidebar-projects
```
