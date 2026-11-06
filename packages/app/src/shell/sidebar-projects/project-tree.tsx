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
import { projectKey, useSidebarProjects } from "./state"
import { ProjectGlyph } from "./glyph"
import { GlyphPicker } from "./glyph-picker"
import { GroupNameInput, ProjectGroup, UNGROUPED } from "./project-group"
import { DragDropProvider, KeyboardSensor, PointerSensor, useDragOperation } from "@dnd-kit/solid"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { ContextMenu } from "@opencode/ui/context-menu"
import { createStore } from "solid-js/store"
import { createSessionMove } from "./session-move"
import { ProjectSessions } from "./project-sessions"
import { openContextMenuFromKeyboard } from "./keyboard"

/** Projects of every visible server, grouped as the user arranged them, each expandable to its root sessions. */
export function ProjectTree() {
  const language = useLanguage()
  const global = useGlobal()
  const servers = useServers()
  const sidebar = useSidebarProjects()
  const [store, setStore] = createStore({ creating: false })
  const moveSession = createSessionMove()
  let tree!: HTMLDivElement

  const projects = createMemo(() =>
    servers.visible.flatMap((conn) => {
      const ctx = global.ensureServerCtx(conn)
      const server = ServerConnection.key(conn)

      const recent = sidebar.inbox.entries().flatMap((entry) => {
        if (entry.server !== server || inboxArchived(entry)) return []
        const project = ctx.projects.forSession(entry.session)

        return project ? [project] : []
      })

      return [
        ...new Map(
          [...ctx.projects.used(), ...recent].map((project) => [projectKey(server, project.worktree), project]),
        ).entries(),
      ].map(([key, project]) => ({ key, server, project }))
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
          .filter((key) => !placed(key))
          .toSorted(
            (a, b) =>
              (sidebar.state.store.placement[a]?.order ?? Infinity) -
              (sidebar.state.store.placement[b]?.order ?? Infinity),
          ),
      },
    ]
  })

  // Without user groups the Ungrouped heading would only label the whole list.
  const headed = () => sidebar.state.store.groups.length > 0

  return (
    <DragDropProvider
      sensors={(defaults) => [
        // Enter and Space open rows rather than pick them up; keyboard users move projects from the context menu.
        ...defaults.filter((sensor) => sensor !== PointerSensor && sensor !== KeyboardSensor),
        PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
          preventActivation: (event) => event.target instanceof Element && !!event.target.closest("[data-no-dnd]"),
        }),
      ]}
      modifiers={[RestrictToVerticalAxis, RestrictToElement.configure({ element: () => tree })]}
      plugins={(defaults) => [
        ...defaults.filter((plugin) => plugin !== AutoScroller && plugin !== Feedback),
        AutoScroller.configure({ acceleration: 8, threshold: { x: 0, y: 0.05 } }),
        Feedback.configure({ dropAnimation: null }),
      ]}
      onDragEnd={(event) => {
        const { source, target } = event.operation

        if (event.canceled || !source || !target) return

        if (source.type === "session" && target.type === "project") {
          // SAFETY: only SessionRow registers the session drag type, with its typed InboxEntry.
          const entry = sidebar.inbox.byKey().get(String(source.id)) ?? (source.data.entry as InboxEntry | undefined)
          const project = byKey().get(String(target.id))

          if (
            entry &&
            project &&
            entry.server === project.server &&
            projectKey(
              entry.server,
              entry.ctx.projects.forSession(entry.session)?.worktree ?? entry.session.location.directory,
            ) !== project.key
          )
            void moveSession(entry, project.project.worktree)

          return
        }

        if (!isSortable(source)) return

        if (source.type === "group") {
          if (source.initialIndex !== source.index) sidebar.state.moveGroup(String(source.id), source.index)

          return
        }

        if (source.type !== "project") return
        const group = target.type === "group-body" ? String(target.data.group) : String(source.group)

        const index =
          target.type === "group-body"
            ? (groups().find((item) => item.id === group)?.projects.length ?? 0)
            : source.index

        if (group === source.initialGroup && index === source.initialIndex) return
        sidebar.state.moveProject(
          String(source.id),
          group === UNGROUPED ? undefined : group,
          index,
          groups().find((item) => item.id === group)?.projects,
        )
      }}
    >
      <div
        ref={tree}
        data-slot="sidebar-projects-tree"
        data-scrollable
        role="tree"
        aria-label={language.t("sidebar.projects.label")}
        class="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pb-1"
      >
        <div class="flex h-8 shrink-0 items-center px-1.5 text-[12px] font-medium text-v2-text-text-faint">
          <span class="flex-1">{language.t("sidebar.projects.label")}</span>
          <button
            type="button"
            data-no-dnd
            aria-label={language.t("sidebar.projects.group.create")}
            class="flex size-6 items-center justify-center rounded hover:bg-v2-overlay-simple-overlay-hover"
            onClick={() => setStore("creating", true)}
          >
            <Icon name="plus" size="small" />
          </button>
        </div>
        <Show when={store.creating}>
          <GroupNameInput
            onCancel={() => setStore("creating", false)}
            onCommit={(name) => {
              sidebar.state.createGroup(name)
              setStore("creating", false)
            }}
          />
        </Show>
        <Show
          when={projects().length > 0 || headed()}
          fallback={
            <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-faint">
              {language.t("sidebar.projects.empty")}
            </div>
          }
        >
          <Key each={groups()} by={(group) => group.id}>
            {(group) => (
              <Show when={group().id !== UNGROUPED || group().projects.length > 0 || headed()}>
                <ProjectGroup
                  id={group().id}
                  index={groups().findIndex((item) => item.id === group().id)}
                  name={group().name}
                  headed={headed()}
                  collapsed={group().collapsed}
                >
                  <For each={group().projects}>
                    {(key) => (
                      <Show when={byKey().get(key)}>
                        {(item) => (
                          <ProjectRow
                            group={group().id}
                            index={group().projects.indexOf(key)}
                            project={item().project}
                            server={item().server}
                            projectKey={key}
                            expanded={!!sidebar.state.store.expanded[key]}
                            onToggle={() => sidebar.state.toggleExpanded(key)}
                          >
                            <ProjectSessions
                              id={key}
                              project={item().project}
                              server={item().server}
                              entries={(sessions().get(key) ?? []).map((value) => value.entry)}
                            />
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
    </DragDropProvider>
  )
}

/** A project: its icon (server color and avatar), name, and when expanded its root sessions. */
function ProjectRow(props: {
  project: LocalProject
  server: ServerConnection.Key
  projectKey: string
  group: string
  index: number
  expanded: boolean
  onToggle: () => void
  children: JSX.Element
}) {
  const dialog = useDialog()
  const servers = useServers()
  const language = useLanguage()
  const sidebar = useSidebarProjects()
  const operation = useDragOperation()

  const sortable = useSortable({
    get id() {
      return props.projectKey
    },
    get index() {
      return props.index
    },
    get group() {
      return props.group
    },
    type: "project",
    accept: (source) =>
      source.type === "project" ||
      (source.type === "session" && source.data.server === props.server && source.data.projectKey !== props.projectKey),
  })

  const openGlyph = () => {
    const server = servers.visible.find((item) => ServerConnection.key(item) === props.server)

    if (server)
      void dialog.show(() => <GlyphPicker project={props.project} server={server} projectKey={props.projectKey} />)
  }

  return (
    <div
      ref={sortable.ref}
      data-slot="sidebar-projects-project"
      role="treeitem"
      aria-expanded={props.expanded}
      class="group/project-container relative flex flex-col"
    >
      <ContextMenu>
        <ContextMenu.Trigger
          as="button"
          ref={(element: HTMLButtonElement) => {
            sortable.handleRef(element)
            sortable.targetRef(element)
          }}
          type="button"
          data-slot="sidebar-projects-project-row"
          title={props.project.worktree}
          class="group/project flex h-8 w-full shrink-0 items-center gap-2 rounded-[6px] px-1.5 text-start text-[13px] leading-4 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
          onClick={props.onToggle}
          onKeyDown={openContextMenuFromKeyboard}
          classList={{
            "bg-v2-background-bg-layer-02 ring-1 ring-inset ring-v2-border-border-base":
              sortable.isDropTarget() && operation.source()?.type === "session",
          }}
        >
          <ProjectGlyph project={props.project} projectKey={props.projectKey} />
          {/* The hover edit button overlays the row end, so the name truncates before it instead of under it. */}
          <bdi class="min-w-0 flex-1 truncate font-medium group-hover/project-container:pe-6 group-focus-within/project-container:pe-6">
            {displayName(props.project)}
          </bdi>
          <Icon
            name="chevron-down"
            size="small"
            class="shrink-0 text-v2-text-text-faint opacity-0 transition-transform group-hover/project:opacity-100 group-focus-visible/project:opacity-100"
            classList={{ "-rotate-90 rtl:rotate-90": !props.expanded }}
          />
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            <ContextMenu.Item onSelect={openGlyph}>{language.t("sidebar.projects.glyph.title")}</ContextMenu.Item>
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger>{language.t("sidebar.projects.group.moveTo")}</ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent>
                  <For each={sidebar.state.store.groups}>
                    {(group) => (
                      <ContextMenu.Item
                        onSelect={() =>
                          sidebar.state.moveProject(props.projectKey, group.id, sidebar.state.members(group.id).length)
                        }
                      >
                        {group.name}
                      </ContextMenu.Item>
                    )}
                  </For>
                  <ContextMenu.Item onSelect={() => sidebar.state.moveProject(props.projectKey, undefined, 0)}>
                    {language.t("sidebar.projects.ungrouped")}
                  </ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
      <button
        type="button"
        data-no-dnd
        aria-label={language.t("sidebar.projects.glyph.title")}
        title={language.t("sidebar.projects.glyph.title")}
        class="absolute end-7 top-1 flex size-6 items-center justify-center rounded-[6px] text-v2-icon-icon-muted opacity-0 hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base group-hover/project-container:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
        onClick={openGlyph}
      >
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
