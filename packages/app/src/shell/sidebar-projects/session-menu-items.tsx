import type { SessionInfo } from "@opencode/client/promise"
import { createMemo, Show } from "solid-js"
import { Menu } from "@opencode/ui/menu"
import { Icon } from "@opencode/ui/icon"
import { useServer } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { useSidebarProjectsState } from "./state"
import { useProjectSessionActions } from "./session-actions"
import { PinIcon } from "./pin-icon"

/** The same session-level actions as the Projects tree, available in every conversation header. */
export function SessionProjectMenuItems(props: { session: SessionInfo | undefined }) {
  const server = useServer()
  const language = useLanguage()
  const state = useSidebarProjectsState()
  const actions = useProjectSessionActions()

  const entry = createMemo<InboxEntry | undefined>(() => {
    const session = props.session

    if (!session) return

    return {
      key: `${server.key}\0${session.id}`,
      conn: server.conn,
      server: server.key,
      ctx: server.ctx,
      session,
      status: "ready",
    }
  })

  return (
    <Show when={entry()}>
      {(entry) => (
        <>
          <Menu.Item
            disabled={!state.ready()}
            onSelect={() =>
              state.togglePin(server.key, entry().session, server.ctx.projects.forSession(entry().session)?.worktree)
            }
          >
            <PinIcon off={state.pinned(server.key, entry().session.id)} />
            {language.t(
              state.pinned(server.key, entry().session.id) ? "sidebar.projects.unpin" : "sidebar.projects.pin",
            )}
          </Menu.Item>
          <Menu.Item disabled={actions.pending(entry())} onSelect={() => void actions.fork(entry())}>
            <Icon name="branch" />
            {language.t("sidebar.projects.fork")}
          </Menu.Item>
          <Menu.Item disabled={actions.pending(entry())} onSelect={() => void actions.archive(entry())}>
            <Icon name="archive" />
            {language.t(
              entry().session.time.archived === undefined ? "sidebar.projects.archive" : "sidebar.projects.unarchive",
            )}
          </Menu.Item>
        </>
      )}
    </Show>
  )
}
