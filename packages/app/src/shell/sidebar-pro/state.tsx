import { Schema } from "effect"
import type { SessionInfo } from "@opencode/client/promise"
import { createContext, createEffect, on, useContext, type ParentProps } from "solid-js"
import { produce } from "solid-js/store"
import { uuid } from "@opencode/util/uuid"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import type { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useLayout } from "@/shell/state/layout"
import { createSessionInbox, type SessionInbox } from "@/shell/titlebar/inbox-model"
import { pathKey } from "@/workspaces/path-key"

/** Sessions added to an expanded project per "Show more". */
export const SHOWN_STEP = 5

const Glyph = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("icon"), name: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("emoji"), value: Schema.String }),
])

export type ProjectGlyph = typeof Glyph.Type

const SidebarProState = Persistence.struct({
  groups: Persistence.array(
    Persistence.struct({
      id: Schema.String,
      name: Schema.String,
      collapsed: Schema.Boolean,
    }),
  ),
  placement: Persistence.record(Persistence.struct({ group: Schema.String, order: Schema.Finite })),
  glyphs: Persistence.record(Glyph),
  expanded: Persistence.record(Schema.Literal(true)),
  hidden: Persistence.record(Schema.Literal(true)),
  pins: Persistence.record(Schema.String),
  unread: Persistence.record(Schema.Literal(true)),
  archived: Schema.Boolean,
  shown: Persistence.record(Schema.Finite),
  dock: Persistence.struct({
    height: Persistence.optional(Schema.Finite),
    attentionCollapsed: Schema.Boolean,
  }),
})

/**
 * Identifies a project in client state. Keyed by worktree path rather than project ID: one path can carry several
 * IDs over time, and projects without a root commit all share the `global` ID.
 */
export function projectKey(server: ServerConnection.Key, worktree: string) {
  return `${server}\0${pathKey(worktree)}`
}

/** Client-local Sidebar Pro preferences. The persisted key stays stable across the branding rename. */
export function createSidebarProState() {
  const [store, setStore, , ready] = persisted(Persist.global("sidebar-projects"), SidebarProState, {
    groups: [],
    placement: {},
    glyphs: {},
    expanded: {},
    hidden: {},
    pins: {},
    unread: {},
    archived: false,
    shown: {},
    dock: { attentionCollapsed: false },
  })

  // `moveProject` renumbers a group's orders to 0..n, so an index into this list is a position in the group.
  const members = (group: string) =>
    Object.entries(store.placement)
      .filter((entry) => entry[1].group === group)
      .toSorted((a, b) => a[1].order - b[1].order)
      .map((entry) => entry[0])

  return {
    store,
    ready,
    /** Project keys placed in a group, in order. */
    members,
    createGroup(name: string) {
      const id = uuid()
      setStore("groups", store.groups.length, { id, name, collapsed: false })

      return id
    },
    renameGroup(id: string, name: string) {
      setStore("groups", (group) => group.id === id, "name", name)
    },
    /** Removes the group; its projects fall back to Ungrouped. */
    removeGroup(id: string) {
      setStore(
        produce((draft) => {
          draft.groups = draft.groups.filter((group) => group.id !== id)
          Object.keys(draft.placement).forEach((key) => {
            if (draft.placement[key]?.group === id) delete draft.placement[key]
          })
        }),
      )
    },
    moveGroup(id: string, index: number) {
      setStore(
        produce((draft) => {
          const from = draft.groups.findIndex((group) => group.id === id)

          if (from === -1) return
          const [group] = draft.groups.splice(from, 1)
          draft.groups.splice(Math.max(0, Math.min(index, draft.groups.length)), 0, group)
        }),
      )
    },
    toggleGroup(id: string) {
      setStore(
        "groups",
        (group) => group.id === id,
        "collapsed",
        (collapsed) => !collapsed,
      )
    },
    /** Places a project at `index`; when provided, visible is the destination's rendered order. */
    moveProject(key: string, group: string | undefined, index: number, visible?: string[]) {
      const order = (group === undefined ? (visible ?? []) : members(group)).filter((item) => item !== key)
      const shown = visible?.filter((item) => item !== key)
      const next = shown?.[Math.max(0, index)]
      const previous = shown?.[Math.min(index, shown.length) - 1]

      // Sortable indices address rendered projects, not members hidden with their server.
      const position =
        group === undefined || !shown
          ? index
          : next
            ? order.indexOf(next)
            : previous
              ? order.indexOf(previous) + 1
              : order.length

      order.splice(Math.max(0, Math.min(position, order.length)), 0, key)
      setStore(
        produce((draft) => {
          delete draft.placement[key]
          order.forEach((item, position) => {
            draft.placement[item] = { group: group ?? "", order: position }
          })
        }),
      )
    },
    setGlyph(key: string, glyph: ProjectGlyph | undefined) {
      setStore(
        produce((draft) => {
          if (glyph) {
            draft.glyphs[key] = glyph

            return
          }

          delete draft.glyphs[key]
        }),
      )
    },
    toggleExpanded(key: string) {
      setStore(
        produce((draft) => {
          if (draft.expanded[key]) {
            delete draft.expanded[key]

            return
          }

          draft.expanded[key] = true
        }),
      )
    },
    /** How many root sessions an expanded project lists. */
    shown: (key: string) => store.shown[key] ?? SHOWN_STEP,
    showMore(key: string) {
      setStore("shown", key, (store.shown[key] ?? SHOWN_STEP) + SHOWN_STEP)
    },
    setDockHeight(height: number | undefined) {
      setStore("dock", "height", height)
    },
    hideProject(key: string) {
      setStore("hidden", key, true)
    },
    showProject(key: string) {
      setStore(
        produce((draft) => {
          delete draft.hidden[key]
        }),
      )
    },
    pinned: (server: ServerConnection.Key, sessionID: string) => !!store.pins[`${server}\0${sessionID}`],
    unread: (server: ServerConnection.Key, sessionID: string) => !!store.unread[`${server}\0${sessionID}`],
    markUnread(server: ServerConnection.Key, sessionID: string) {
      if (!ready()) return
      setStore("unread", `${server}\0${sessionID}`, true)
    },
    clearUnread(server: ServerConnection.Key, sessionID: string) {
      if (!ready() || !store.unread[`${server}\0${sessionID}`]) return
      setStore(
        produce((draft) => {
          delete draft.unread[`${server}\0${sessionID}`]
        }),
      )
    },
    togglePin(server: ServerConnection.Key, session: SessionInfo, worktree = session.location.directory) {
      if (!ready()) return
      const key = `${server}\0${session.id}`
      setStore(
        produce((draft) => {
          if (draft.pins[key]) {
            delete draft.pins[key]

            return
          }

          draft.pins[key] = projectKey(server, worktree)
        }),
      )
    },
    toggleArchived() {
      setStore("archived", !store.archived)
    },
    toggleAttention() {
      setStore("dock", "attentionCollapsed", !store.dock.attentionCollapsed)
    },
  }
}

export type SidebarProStore = ReturnType<typeof createSidebarProState>

const SidebarProStateContext = createContext<SidebarProStore>()

/** Preferences are shared with conversation-header actions, without starting an inbox in other interface modes. */
export function SidebarProStateProvider(props: ParentProps) {
  const state = createSidebarProState()
  const layout = useLayout()
  const global = useGlobal()

  // Clear on entering a conversation from any surface, not on changes to its unread reminder.
  // In particular, marking the currently open conversation unread must survive until the next opening.
  createEffect(
    on(
      () => {
        const route = layout.route()

        return state.ready() && route.type === "session" ? `${route.server}\0${route.sessionId}` : undefined
      },
      (key) => {
        if (!key) return
        const route = layout.route()

        if (route.type !== "session") return
        state.clearUnread(route.server, route.sessionId)
        const ctx = global.serverCtx(route.server)

        if (ctx) state.clearUnread(route.server, ctx.data.session.root(route.sessionId))
      },
    ),
  )

  return <SidebarProStateContext.Provider value={state}>{props.children}</SidebarProStateContext.Provider>
}

export function useSidebarProState() {
  const state = useContext(SidebarProStateContext)

  if (!state) throw new Error("useSidebarProState must be used within SidebarProStateProvider")

  return state
}

const SidebarProContext = createContext<{ state: SidebarProStore; inbox: SessionInbox }>()

/** One store and one session inbox shared by the tree and the dock. */
export function SidebarProProvider(props: ParentProps) {
  const value = { state: useSidebarProState(), inbox: createSessionInbox() }

  return <SidebarProContext.Provider value={value}>{props.children}</SidebarProContext.Provider>
}

export function useSidebarPro() {
  const value = useContext(SidebarProContext)

  if (!value) throw new Error("useSidebarPro must be used within SidebarProProvider")

  return value
}
