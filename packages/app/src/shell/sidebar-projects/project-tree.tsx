import { Key } from "@solid-primitives/keyed"
import { createMemo, For, Show, type JSX } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { displayName } from "@opencode/ui/project-avatar"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useDialog } from "@opencode/ui/context/dialog"
import type { LocalProject } from "@/shell/state/layout"
import { inboxArchived, type InboxEntry } from "@/shell/titlebar/inbox-model"
import { SessionRow } from "./session-row"
import { projectKey, useSidebarProjects } from "./state"
import { ProjectGlyph } from "./glyph"
import { GlyphPicker } from "./glyph-picker"

/** Ungrouped is implicit: it holds every project without a placement and is not stored. */
const UNGROUPED = "\0ungrouped"

/** Projects of every visible server, grouped as the user arranged them, each expandable to its root sessions. */
export function ProjectTree() {
  const language = useLanguage()
  const global = useGlobal()
  const servers = useServers()
  const sidebar = useSidebarProjects()

  const projects = createMemo(() =>
    servers.visible.flatMap((conn) => {
      const ctx = global.ensureServerCtx(conn)
      const server = ServerConnection.key(conn)

      return ctx.projects.used().map((project) => ({ key: projectKey(server, project.worktree), server, project }))
    }),
  )

  const byKey = createMemo(() => new Map(projects().map((item) => [item.key, item])))

  // Root sessions per project, newest first (the inbox order). Archived ones only reach the inbox once opened.
  const sessions = createMemo(() =>
    Map.groupBy(
      sidebar.inbox.entries().flatMap((entry) => {
        const project = entry.ctx.projects.forSession(entry.session)

        if (!project || inboxArchived(entry)) return []

        return [{ key: projectKey(entry.server, project.worktree), entry }]
      }),
      (item) => item.key,
    ),
  )

  const groups = createMemo(() => {
    const ids = new Set(sidebar.state.store.groups.map((group) => group.id))

    const placed = (key: string) => {
      const group = sidebar.state.store.placement[key]?.group

      return group !== undefined && ids.has(group)
    }

    return [
      ...sidebar.state.store.groups.map((group) => ({
        id: group.id,
        name: group.name,
        collapsed: group.collapsed,
        projects: sidebar.state.members(group.id).filter((key) => byKey().has(key)),
      })),
      {
        id: UNGROUPED,
        name: language.t("sidebar.projects.ungrouped"),
        collapsed: false,
        projects: projects()
          .map((item) => item.key)
          .filter((key) => !placed(key)),
      },
    ]
  })

  // Without user groups the Ungrouped heading would only label the whole list.
  const headed = () => sidebar.state.store.groups.length > 0

  return (
    <div
      data-slot="sidebar-projects-tree"
      data-scrollable
      role="tree"
      aria-label={language.t("sidebar.projects.label")}
      class="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pb-1"
    >
      <Show
        when={projects().length > 0}
        fallback={
          <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-faint">
            {language.t("sidebar.projects.empty")}
          </div>
        }
      >
        <Key each={groups()} by={(group) => group.id}>
          {(group) => (
            <Show when={group().id !== UNGROUPED || group().projects.length > 0}>
              <ProjectGroup
                name={group().name}
                headed={headed()}
                collapsed={group().collapsed}
                onToggle={group().id === UNGROUPED ? undefined : () => sidebar.state.toggleGroup(group().id)}
              >
                <For each={group().projects}>
                  {(key) => (
                    <Show when={byKey().get(key)}>
                      {(item) => (
                        <ProjectRow
                          project={item().project}
                          server={item().server}
                          projectKey={key}
                          expanded={!!sidebar.state.store.expanded[key]}
                          onToggle={() => sidebar.state.toggleExpanded(key)}
                        >
                          <ProjectSessions id={key} entries={(sessions().get(key) ?? []).map((value) => value.entry)} />
                        </ProjectRow>
                      )}
                    </Show>
                  )}
                </For>
              </ProjectGroup>
            </Show>
          )}
        </Key>
      </Show>
    </div>
  )
}

/** A user-defined group, or the implicit Ungrouped one. Phase 2 adds rename, delete and drag handles here. */
function ProjectGroup(props: {
  name: string
  headed: boolean
  collapsed: boolean
  onToggle?: () => void
  children: JSX.Element
}) {
  return (
    <div data-slot="sidebar-projects-group" role="group" aria-label={props.name} class="flex shrink-0 flex-col gap-px">
      <Show when={props.headed}>
        <Show
          when={props.onToggle}
          fallback={
            <div class="mt-2 flex h-6 shrink-0 items-center px-1.5 text-[12px] leading-4 font-medium text-v2-text-text-faint">
              <span class="min-w-0 truncate">{props.name}</span>
            </div>
          }
        >
          {(toggle) => (
            <button
              type="button"
              data-slot="sidebar-projects-group-header"
              aria-expanded={!props.collapsed}
              class="group/header mt-2 flex h-6 w-full shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-start text-[12px] leading-4 font-medium text-v2-text-text-faint hover:text-v2-text-text-muted focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
              onClick={toggle()}
            >
              <span class="min-w-0 truncate">{props.name}</span>
              <Icon
                name="chevron-down"
                size="small"
                class="shrink-0 opacity-0 transition-transform group-hover/header:opacity-100 group-focus-visible/header:opacity-100"
                classList={{ "-rotate-90 rtl:rotate-90 opacity-100": props.collapsed }}
              />
            </button>
          )}
        </Show>
      </Show>
      <Show when={!props.collapsed}>{props.children}</Show>
    </div>
  )
}

/** A project: its icon (server color and avatar), name, and when expanded its root sessions. */
function ProjectRow(props: { project: LocalProject; server: ServerConnection.Key; projectKey: string; expanded: boolean; onToggle: () => void; children: JSX.Element }) {
  const dialog = useDialog()
  const servers = useServers()
  const language = useLanguage()
  const openGlyph = () => {
    const server = servers.visible.find((item) => ServerConnection.key(item) === props.server)
    if (server) void dialog.show(() => <GlyphPicker project={props.project} server={server} projectKey={props.projectKey} />)
  }
  return (
    <div data-slot="sidebar-projects-project" role="treeitem" aria-expanded={props.expanded} class="flex flex-col">
      <button
        type="button"
        data-slot="sidebar-projects-project-row"
        title={props.project.worktree}
        class="group/project flex h-8 w-full shrink-0 items-center gap-2 rounded-[6px] px-1.5 text-start text-[13px] leading-4 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
        onClick={props.onToggle}
        onContextMenu={(event) => { event.preventDefault(); openGlyph() }}
      >
        <ProjectGlyph project={props.project} projectKey={props.projectKey} />
        <bdi class="min-w-0 flex-1 truncate font-medium">{displayName(props.project)}</bdi>
        <Icon
          name="chevron-down"
          size="small"
          class="shrink-0 text-v2-text-text-faint opacity-0 transition-transform group-hover/project:opacity-100 group-focus-visible/project:opacity-100"
          classList={{ "-rotate-90 rtl:rotate-90": !props.expanded }}
        />
      </button>
      <button type="button" aria-label={language.t("sidebar.projects.glyph.title")} title={language.t("sidebar.projects.glyph.title")} class="absolute end-7 top-1 flex size-6 items-center justify-center rounded bg-v2-background-bg-base opacity-0 group-hover/project-container:opacity-100 focus-visible:opacity-100" onClick={openGlyph}>
        <Icon name="edit" size="small" />
      </button>
      <Show when={props.expanded}>
        <div role="group" class="flex flex-col gap-px pb-1">
          {props.children}
        </div>
      </Show>
    </div>
  )
}

/** An expanded project's root sessions: the newest few, then "Show more". `id` is the project key. */
function ProjectSessions(props: { id: string; entries: InboxEntry[] }) {
  const language = useLanguage()
  const sidebar = useSidebarProjects()
  const shown = () => sidebar.state.shown(props.id)
  const keys = createMemo(() => props.entries.slice(0, shown()).map((entry) => entry.key))

  return (
    <Show
      when={props.entries.length > 0}
      fallback={
        <Show when={!sidebar.inbox.loading()}>
          <div class="flex h-7 items-center ps-[30px] pe-1.5 text-[12px] leading-4 text-v2-text-text-faint">
            {language.t("sidebar.projects.noSessions")}
          </div>
        </Show>
      }
    >
      {/* Rows read entries by key so live session updates do not remount them. */}
      <For each={keys()}>
        {(key) => (
          <Show when={sidebar.inbox.byKey().get(key)}>
            {(entry) => (
              <SessionRow
                entry={entry()}
                selected={sidebar.inbox.selected(entry())}
                onOpen={() => {
                  sidebar.inbox.open(entry())
                  sidebar.inbox.markViewed(entry())
                }}
              />
            )}
          </Show>
        )}
      </For>
      <Show when={props.entries.length > shown()}>
        <button
          type="button"
          data-slot="sidebar-projects-show-more"
          class="flex h-7 w-full shrink-0 items-center rounded-[6px] ps-[30px] pe-1.5 text-start text-[12px] leading-4 text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-muted focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
          onClick={() => sidebar.state.showMore(props.id)}
        >
          {language.t("sidebar.projects.showMore")}
        </button>
      </Show>
    </Show>
  )
}
