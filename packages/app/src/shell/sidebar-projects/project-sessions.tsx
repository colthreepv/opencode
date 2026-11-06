import type { SessionInfo } from "@opencode/client/promise"
import { createMemo, For, Show, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useLanguage } from "@/runtime/i18n/language"
import type { LocalProject } from "@/shell/state/layout"
import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import { SessionRow } from "./session-row"
import { projectKey, useSidebarProjects } from "./state"

export function ProjectSessions(props: {
  id: string
  project: LocalProject
  server: ServerConnection.Key
  entries: InboxEntry[]
}) {
  const language = useLanguage()
  const sidebar = useSidebarProjects()
  const global = useGlobal()
  const servers = useServers()

  const [store, setStore] = createStore<{
    sessions: SessionInfo[]
    cursor?: string
    loaded: boolean
    loading: boolean
    more: boolean
  }>({ sessions: [], loaded: false, loading: false, more: true })

  const conn = () => servers.visible.find((item) => ServerConnection.key(item) === props.server)

  const entries = createMemo(() => {
    const connection = conn()

    if (!connection) return props.entries
    const ctx = global.ensureServerCtx(connection)

    const fetched = ctx.data.session.apply(store.sessions).flatMap((session): InboxEntry[] => {
      const live = ctx.data.session.get(session.id) ?? session
      const project = ctx.projects.forSession(live)

      if (!project || projectKey(props.server, project.worktree) !== props.id || live.time.archived !== undefined)
        return []

      return [
        {
          key: `${props.server}\0${live.id}`,
          conn: connection,
          server: props.server,
          ctx,
          session: live,
          status: "ready",
        },
      ]
    })

    return [...new Map([...fetched, ...props.entries].map((entry) => [entry.key, entry])).values()].toSorted(
      (a, b) => b.session.time.updated - a.session.time.updated,
    )
  })

  const byKey = createMemo(() => new Map(entries().map((entry) => [entry.key, entry])))

  const load = async () => {
    const connection = conn()

    if (!connection || store.loading || !store.more) return
    setStore("loading", true)
    const ctx = global.ensureServerCtx(connection)
    await ctx.sdk.api.session
      .list({
        project: props.project.id,
        directory: props.project.id === "global" ? props.project.worktree : undefined,
        parentID: null,
        limit: 50,
        order: "desc",
        cursor: store.cursor,
      })
      .then((response) => {
        response.data.forEach((session) => {
          if (!ctx.data.session.get(session.id)) ctx.data.session.remember(session)
        })
        setStore({
          sessions: [...store.sessions, ...response.data],
          cursor: response.cursor.next ?? undefined,
          more: response.data.length === 50 && !!response.cursor.next,
          loaded: true,
        })
      })
      .catch((cause) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(cause, language.t("common.requestFailed")),
        }),
      )
      .finally(() => setStore("loading", false))
  }

  onMount(() => void load())

  return (
    <>
      <Show when={entries().length === 0 && store.loaded && !sidebar.inbox.loading()}>
        <div class="flex h-7 items-center ps-[30px] text-[12px] leading-4 text-v2-text-text-faint">
          {language.t("sidebar.projects.noSessions")}
        </div>
      </Show>
      <For
        each={entries()
          .slice(0, sidebar.state.shown(props.id))
          .map((entry) => entry.key)}
      >
        {(key) => (
          <Show when={byKey().get(key)}>
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
      <Show when={entries().length > sidebar.state.shown(props.id) || store.more}>
        <button
          type="button"
          disabled={store.loading}
          data-slot="sidebar-projects-show-more"
          class="flex h-7 items-center rounded ps-[30px] text-start text-[12px] leading-4 text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover"
          onClick={() => {
            sidebar.state.showMore(props.id)

            if (sidebar.state.shown(props.id) >= entries().length) void load()
          }}
        >
          {language.t("sidebar.projects.showMore")}
        </button>
      </Show>
    </>
  )
}
