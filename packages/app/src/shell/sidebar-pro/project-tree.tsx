import { Key } from "@solid-primitives/keyed"
import { createMemo, For, Show, type JSX } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { displayName } from "@opencode/ui/project-avatar"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useDialog } from "@opencode/ui/context/dialog"
import type { LocalProject } from "@/shell/state/layout"
import { inboxArchived, inboxBusy, type InboxEntry } from "@/shell/titlebar/inbox-model"
import { projectKey, useSidebarPro } from "./state"
import { ProjectGlyph } from "./glyph"
import { GlyphPicker } from "./glyph-picker"
import { GroupNameInput, ProjectGroup, UNGROUPED } from "./project-group"
import { DragDropProvider, KeyboardSensor, PointerSensor, useDragOperation } from "@dnd-kit/solid"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { ContextMenu } from "@opencode/ui/context-menu"
import { Menu } from "@opencode/ui/menu"
import { createStore } from "solid-js/store"
import { createSessionMove } from "./session-move"
import { ProjectSessions } from "./project-sessions"
import { openContextMenuFromKeyboard } from "./keyboard"
import { createArchiveDiscovery, createPinHydration, pinTarget } from "./archive-model"
import { useTabs } from "@/shell/tabs/tabs"
import "./project-tree.css"

/**
 * Projects of every visible server, grouped as the user arranged them, each expandable to its root sessions. The
 * Archived toggle swaps every list for the archive and hides projects and groups without archived conversations.
 */
export function ProjectTree() {
  const language = useLanguage()
  const global = useGlobal()
  const servers = useServers()
  const sidebar = useSidebarPro()
  const [store, setStore] = createStore({ creating: false })
  const moveSession = createSessionMove()
  let tree!: HTMLDivElement

  const archived = () => sidebar.state.store.archived

  // Keyed by plain string so pin keys, split from persisted state, can look servers up.
  const connections = createMemo(
    () =>
      new Map(
        servers.visible.flatMap((conn) => {
          const server = ServerConnection.key(conn)
          const ctx = global.serverCtx(server)

          return ctx ? [[String(server), { conn, server, ctx }] as const] : []
        }),
      ),
  )

  // Root sessions in the current mode per project, newest first (the inbox order).
  const sessions = createMemo(() =>
    Map.groupBy(
      sidebar.inbox.entries().flatMap((entry) => {
        const project = entry.ctx.projects.forSession(entry.session)

        if (!project || inboxArchived(entry) !== archived()) return []

        return [{ key: projectKey(entry.server, project.worktree), project, entry }]
      }),
      (item) => item.key,
    ),
  )

  // Activity belongs to the whole project, not just the visible page or the current archive mode.
  const busyProjects = createMemo(
    () =>
      new Set(
        sidebar.inbox.entries().flatMap((entry) => {
          const project = entry.ctx.projects.forSession(entry.session)

          return project && inboxBusy(entry.status) ? [projectKey(entry.server, project.worktree)] : []
        }),
      ),
  )

  // Pins are grouped by the session's current project, which can differ from the directory stored when pinning.
  const pinned = createMemo(() =>
    Map.groupBy(
      Object.keys(sidebar.state.store.pins).flatMap((key) => {
        const target = pinTarget(key)
        const item = connections().get(target.server)
        const known = sidebar.inbox.byKey().get(key)
        const session = item?.ctx.data.session.get(target.id) ?? known?.session

        if (!item || !session || (session.time.archived !== undefined) !== archived()) return []
        const project = item.ctx.projects.forSession(session)

        if (!project) return []

        const entry: InboxEntry = known
          ? { ...known, session }
          : { key, conn: item.conn, server: item.server, ctx: item.ctx, session, status: "ready", since: undefined }

        return [{ key: projectKey(item.server, project.worktree), project, entry }]
      }),
      (item) => item.key,
    ),
  )

  // Wait for the index so pins it already covers are not fetched one by one.
  const unresolvedPins = createMemo(() =>
    sidebar.inbox.loading()
      ? []
      : Object.keys(sidebar.state.store.pins).flatMap((key) => {
          const target = pinTarget(key)
          const item = connections().get(target.server)

          if (!item || sidebar.inbox.byKey().has(key) || item.ctx.data.session.get(target.id)) return []

          return [{ key, id: target.id, server: item.server, ctx: item.ctx }]
        }),
  )

  createPinHydration({ pins: unresolvedPins })

  const knownProjects = createMemo(() =>
    [...connections().values()].flatMap((item) => {
      const recent = [...sessions().values(), ...pinned().values()].flatMap((list) =>
        list.flatMap((value) => (value.entry.server === item.server ? [value.project] : [])),
      )

      // Projects whose conversations are all archived are only in the server catalog.
      const catalog = archived() ? item.ctx.projects.unique() : []

      return [
        ...new Map(
          [...item.ctx.projects.used(), ...catalog, ...recent].map((project) => [
            projectKey(item.server, project.worktree),
            project,
          ]),
        ).entries(),
      ].map(([key, project]) => ({ key, server: item.server, ctx: item.ctx, project }))
    }),
  )

  const shownProjects = createMemo(() => knownProjects().filter((item) => !sidebar.state.store.hidden[item.key]))
  const hiddenProjects = createMemo(() => knownProjects().filter((item) => sidebar.state.store.hidden[item.key]))

  const discovery = createArchiveDiscovery({
    enabled: archived,
    projects: () => (archived() ? shownProjects() : []),
  })

  const projects = createMemo(() =>
    archived()
      ? shownProjects().filter(
          (item) => sessions().has(item.key) || pinned().has(item.key) || discovery.found(item.key),
        )
      : shownProjects(),
  )

  const byKey = createMemo(() => new Map(projects().map((item) => [item.key, item])))

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
    ].filter((group) => !archived() || group.projects.length > 0)
  })

  // Without user groups the Ungrouped heading would only label the whole list.
  const headed = () => sidebar.state.store.groups.length > 0

  const newGroup = () => language.t("sidebar.projects.toolbar.newGroup")
  const archivedLabel = () => language.t("sidebar.projects.toolbar.archived")

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
        // Rows own button/tree semantics and keyboard menus. DnD's plugin marks non-draggable history and the
        // Ungrouped container aria-disabled, incorrectly disabling their otherwise usable descendants.
        ...defaults.filter((plugin) => plugin !== Accessibility && plugin !== AutoScroller && plugin !== Feedback),
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
        <div
          data-slot="sidebar-projects-toolbar"
          class="mb-1 flex h-8 shrink-0 items-center gap-0.5 border-b border-v2-border-border-muted px-1"
        >
          <Tooltip value={newGroup()} placement="bottom">
            <Button
              type="button"
              data-no-dnd
              data-slot="sidebar-projects-toolbar-button"
              data-action="new-group"
              size="small"
              variant="ghost-muted"
              icon="plus"
              aria-label={newGroup()}
              onClick={() => setStore("creating", true)}
            >
              <span data-slot="sidebar-projects-toolbar-label">{newGroup()}</span>
            </Button>
          </Tooltip>
          <Tooltip value={archivedLabel()} placement="bottom">
            <Button
              type="button"
              data-no-dnd
              data-slot="sidebar-projects-toolbar-button"
              data-pressed={archived() ? "" : undefined}
              size="small"
              variant="ghost-muted"
              icon="archive"
              aria-label={archivedLabel()}
              aria-pressed={archived()}
              onClick={() => sidebar.state.toggleArchived()}
            >
              <span data-slot="sidebar-projects-toolbar-label">{archivedLabel()}</span>
            </Button>
          </Tooltip>
          <div class="flex-1" />
          <Show when={hiddenProjects().length > 0}>
            <Menu gutter={4} modal={false} placement="bottom-end">
              <Tooltip value={language.t("common.moreOptions")} placement="bottom">
                <Menu.Trigger
                  as={IconButton}
                  data-no-dnd
                  variant="ghost-muted"
                  size="normal"
                  icon={<Icon name="outline-dots" />}
                  aria-label={language.t("common.moreOptions")}
                />
              </Tooltip>
              <Menu.Portal>
                <Menu.Content>
                  <Menu.Group>
                    <Menu.GroupLabel>{language.t("sidebar.projects.hidden")}</Menu.GroupLabel>
                    <For each={hiddenProjects()}>
                      {(item) => (
                        <Menu.Item onSelect={() => sidebar.state.showProject(item.key)}>
                          {language.t("sidebar.projects.showProject", { name: displayName(item.project) })}
                        </Menu.Item>
                      )}
                    </For>
                  </Menu.Group>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          </Show>
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
          when={projects().length > 0 || (headed() && !archived())}
          fallback={
            <Show
              when={archived()}
              fallback={
                <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-faint">
                  {language.t("sidebar.projects.empty")}
                </div>
              }
            >
              <ArchiveStatus discovery={discovery} empty />
            </Show>
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
                  empty={group().projects.length === 0}
                  placeholder={!archived()}
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
                              archived={archived()}
                              busy={busyProjects().has(key)}
                              entries={(sessions().get(key) ?? []).map((value) => value.entry)}
                              pinned={(pinned().get(key) ?? [])
                                .map((value) => value.entry)
                                .toSorted((a, b) => b.session.time.updated - a.session.time.updated)}
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
          <Show when={archived()}>
            <ArchiveStatus discovery={discovery} />
          </Show>
        </Show>
      </div>
    </DragDropProvider>
  )
}

/** Discovery progress and failures in the archive view, and its empty state once every project answered. */
function ArchiveStatus(props: { discovery: ReturnType<typeof createArchiveDiscovery>; empty?: boolean }) {
  const language = useLanguage()

  return (
    <Show
      when={props.discovery.loading() || props.discovery.failed()}
      fallback={
        <Show when={props.empty}>
          <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-faint">
            {language.t("sidebar.projects.archived.empty")}
          </div>
        </Show>
      }
    >
      <Show
        when={!props.discovery.loading()}
        fallback={
          <div
            role="status"
            data-slot="sidebar-projects-archive-loading"
            class="flex h-8 shrink-0 items-center gap-2 px-1.5 text-[12px] leading-4 text-v2-text-text-faint"
          >
            <Loader width={14} height={14} class="shrink-0" />
            <span class="min-w-0 truncate">{language.t("sidebar.projects.archived.loading")}</span>
          </div>
        }
      >
        <div
          role="alert"
          data-slot="sidebar-projects-archive-error"
          class="flex h-8 shrink-0 items-center gap-2 px-1.5 text-[12px] leading-4 text-v2-text-text-faint"
        >
          <span class="min-w-0 flex-1 truncate">{language.t("sidebar.projects.archived.failed")}</span>
          <button
            type="button"
            data-no-dnd
            class="shrink-0 rounded px-1 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
            onClick={() => props.discovery.retry()}
          >
            {language.t("common.retry")}
          </button>
        </div>
      </Show>
    </Show>
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
  const sidebar = useSidebarPro()
  const tabs = useTabs()
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
    // The archive omits empty members, so its indices are not positions in the complete group order.
    get disabled() {
      return sidebar.state.store.archived
    },
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
          {/* Leave room for the sibling action buttons without nesting buttons inside the row trigger. */}
          <bdi class="min-w-0 flex-1 truncate font-medium group-hover/project-container:pe-14 group-focus-within/project-container:pe-14 [@media(hover:none)]:pe-14">
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
            <ContextMenu.Item
              onSelect={() => void tabs.newDraft({ server: props.server, directory: props.project.worktree }, "")}
            >
              {language.t("command.session.new")}
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={openGlyph}>{language.t("common.edit")}</ContextMenu.Item>
            <ContextMenu.Item onSelect={() => sidebar.state.hideProject(props.projectKey)}>
              {language.t("sidebar.projects.hideProject")}
            </ContextMenu.Item>
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
      <div class="absolute end-7 top-1 flex items-center gap-1 opacity-0 group-hover/project-container:opacity-100 group-focus-within/project-container:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          data-no-dnd
          aria-label={language.t("dialog.project.edit.title")}
          title={language.t("dialog.project.edit.title")}
          class="flex size-6 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
          onClick={openGlyph}
        >
          <Icon name="sliders" size="small" />
        </button>
        <button
          type="button"
          data-no-dnd
          aria-label={language.t("command.session.new")}
          title={language.t("command.session.new")}
          class="flex size-6 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
          onClick={() => void tabs.newDraft({ server: props.server, directory: props.project.worktree }, "")}
        >
          <Icon name="plus" size="small" />
        </button>
      </div>
      <Show when={props.expanded}>
        <div role="group" class="flex flex-col gap-px pb-1">
          {props.children}
        </div>
      </Show>
    </div>
  )
}
