import { Schema } from "effect"
import { createContext, useContext, type ParentProps } from "solid-js"
import { produce } from "solid-js/store"
import { uuid } from "@opencode/util/uuid"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import type { ServerConnection } from "@/runtime/server/registry"
import { createSessionInbox, type SessionInbox } from "@/shell/titlebar/inbox-model"
import { pathKey } from "@/workspaces/path-key"

/** Sessions added to an expanded project per "Show more". */
export const SHOWN_STEP = 5

const Glyph = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("icon"), name: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("emoji"), value: Schema.String }),
])

export type ProjectGlyph = typeof Glyph.Type

const SidebarProjectsState = Persistence.struct({
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

/** Client-local layout of the Projects sidebar: user groups, project placement and per-project view state. */
export function createSidebarProjectsState() {
  const [store, setStore, , ready] = persisted(Persist.global("sidebar-projects"), SidebarProjectsState, {
    groups: [],
    placement: {},
    glyphs: {},
    expanded: {},
    hidden: {},
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
    toggleAttention() {
      setStore("dock", "attentionCollapsed", !store.dock.attentionCollapsed)
    },
  }
}

export type SidebarProjectsStore = ReturnType<typeof createSidebarProjectsState>

const SidebarProjectsContext = createContext<{ state: SidebarProjectsStore; inbox: SessionInbox }>()

/** One store and one session inbox shared by the tree and the dock. */
export function SidebarProjectsProvider(props: ParentProps) {
  const value = { state: createSidebarProjectsState(), inbox: createSessionInbox() }

  return <SidebarProjectsContext.Provider value={value}>{props.children}</SidebarProjectsContext.Provider>
}

export function useSidebarProjects() {
  const value = useContext(SidebarProjectsContext)

  if (!value) throw new Error("useSidebarProjects must be used within SidebarProjectsProvider")

  return value
}
