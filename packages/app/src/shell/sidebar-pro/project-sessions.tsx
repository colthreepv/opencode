import { createEffect, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Loader } from "@opencode/ui/loader"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useLanguage } from "@/runtime/i18n/language"
import type { LocalProject } from "@/shell/state/layout"
import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { createProjectPages } from "./archive-model"
import { SessionRow } from "./session-row"
import { SessionOrder } from "./session-order-machine"
import { projectKey, SHOWN_STEP, useSidebarPro } from "./state"

/**
 * An expanded project's root sessions: every pinned one, then the newest unpinned ones with "Show more", which pages
 * through the server 50 at a time. `archived` lists the archive instead, with the same layout.
 */
export function ProjectSessions(props: {
  id: string
  project: LocalProject
  server: ServerConnection.Key
  archived: boolean
  busy: boolean
  /** Known root sessions of this project in the current mode, from the inbox and the live store. */
  entries: InboxEntry[]
  /** Pinned root sessions of this project in the current mode, newest first. */
  pinned: InboxEntry[]
}) {
  const language = useLanguage()
  const sidebar = useSidebarPro()
  const global = useGlobal()
  const servers = useServers()
  // The archive is a transient view, so its length is not remembered like the normal list's.
  const [store, setStore] = createStore({ shown: SHOWN_STEP })

  const item = createMemo(() => {
    const conn = servers.visible.find((value) => ServerConnection.key(value) === props.server)

    const ctx = global.serverCtx(props.server)

    if (!conn || !ctx) return

    return { conn, key: props.id, server: props.server, ctx, project: props.project }
  })

  const pages = createProjectPages({ item, archived: () => props.archived })

  const shown = () => (props.archived ? store.shown : sidebar.state.shown(props.id))

  const unpinned = createMemo(() => {
    const current = item()
    const pinned = new Set(props.pinned.map((entry) => entry.key))
    const known = new Map(props.entries.map((entry) => [entry.key, entry]))

    // Page rows can be stale: the live store wins on project and archive state, and deleted sessions drop out.
    const fetched = current
      ? current.ctx.data.session
          .apply(pages.sessions().map((page) => current.ctx.data.session.get(page.id) ?? page))
          .flatMap((session): InboxEntry[] => {
            const key = `${props.server}\0${session.id}`

            if (known.has(key)) return []
            const project = current.ctx.projects.forSession(session)

            if (
              (session.time.archived !== undefined) !== props.archived ||
              projectKey(props.server, project?.worktree ?? session.location.directory) !== props.id
            )
              return []

            return [
              {
                key,
                conn: current.conn,
                server: props.server,
                ctx: current.ctx,
                session,
                status: "ready",
                since: undefined,
              },
            ]
          })
      : []

    return [...props.entries, ...fetched]
      .filter((entry) => !pinned.has(entry.key))
      .toSorted((a, b) => b.session.time.updated - a.session.time.updated)
  })

  const byKey = createMemo(() => new Map([...props.pinned, ...unpinned()].map((entry) => [entry.key, entry] as const)))

  const order = createMemo<SessionOrder.State>(
    (previous) =>
      SessionOrder.transition(previous, {
        type: "reconcile",
        busy: props.busy,
        archived: props.archived,
        pinned: props.pinned.map((entry) => entry.key),
        unpinned: unpinned().map((entry) => entry.key),
      }),
    { type: "idle", archived: props.archived, pinned: [], unpinned: [] },
  )

  const visible = createMemo(() => [...order().pinned, ...order().unpinned.slice(0, shown())])

  const showMore = () => {
    if (props.archived) setStore("shown", store.shown + SHOWN_STEP)

    if (!props.archived) sidebar.state.showMore(props.id)

    if (shown() >= unpinned().length) pages.next()
  }

  // The inbox may already cover several pages. Skip overlapping pages until the user's requested rows are found.
  createEffect(() => {
    if (shown() > unpinned().length && pages.more() && !pages.loading() && !pages.failed()) pages.next()
  })

  const empty = () =>
    pages.loaded() &&
    !pages.more() &&
    !pages.failed() &&
    props.pinned.length === 0 &&
    unpinned().length === 0 &&
    (props.archived || !sidebar.inbox.loading())

  return (
    <>
      <For each={visible()}>
        {(key) => (
          <Show when={byKey().get(key)}>
            {(entry) => (
              <SessionRow
                entry={entry()}
                worktree={props.project.worktree}
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
      <Show when={pages.loading()}>
        <div
          role="status"
          data-slot="sidebar-projects-sessions-loading"
          class="flex h-7 shrink-0 items-center ps-[30px] text-v2-icon-icon-faint"
        >
          <Loader width={14} height={14} />
          <span class="sr-only">{language.t("common.loading")}</span>
        </div>
      </Show>
      <Show when={pages.failed() && !pages.loading()}>
        <div
          role="alert"
          data-slot="sidebar-projects-sessions-error"
          class="flex h-7 shrink-0 items-center gap-2 ps-[30px] pe-1.5 text-[12px] leading-4 text-v2-text-text-faint"
        >
          <span class="min-w-0 flex-1 truncate">{language.t("sidebar.projects.sessions.failed")}</span>
          <button
            type="button"
            data-no-dnd
            class="shrink-0 rounded px-1 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
            onClick={pages.retry}
          >
            {language.t("common.retry")}
          </button>
        </div>
      </Show>
      <Show when={empty()}>
        <div class="flex h-7 items-center ps-[30px] text-[12px] leading-4 text-v2-text-text-faint">
          {language.t(props.archived ? "sidebar.projects.archived.empty" : "sidebar.projects.noSessions")}
        </div>
      </Show>
      <Show when={!pages.loading() && !pages.failed() && (unpinned().length > shown() || pages.more())}>
        <button
          type="button"
          data-slot="sidebar-projects-show-more"
          class="flex h-7 shrink-0 items-center rounded-[6px] ps-[30px] text-start text-[12px] leading-4 text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-muted focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
          onClick={showMore}
        >
          {language.t("sidebar.projects.showMore")}
        </button>
      </Show>
    </>
  )
}
