import type { SessionInfo } from "@opencode/client/promise"
import { createMemo, Show } from "solid-js"
import { Menu } from "@opencode/ui/menu"
import { Icon } from "@opencode/ui/icon"
import { useServer } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { useSidebarProState } from "./state"
import { useSidebarProSessionActions } from "./session-actions"
import { PinIcon } from "./pin-icon"

/** The same session-level actions as the Projects tree, available in every conversation header. */
export function SidebarProSessionMenuItems(props: { session: SessionInfo | undefined }) {
  const server = useServer()
  const language = useLanguage()
  const state = useSidebarProState()
  const actions = useSidebarProSessionActions()

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
          <Menu.Item onSelect={() => void actions.copyID(entry())}>
            <Icon name="copy" />
            {language.t("sidebar.projects.copyID")}
          </Menu.Item>
          <Menu.Item onSelect={() => void actions.copyReference(entry())}>
            <Icon name="outline-share" />
            {language.t("sidebar.projects.copyReference")}
          </Menu.Item>
          <Menu.Item disabled={!actions.ready()} onSelect={() => actions.toggleUnread(entry())}>
            <Icon name={actions.unread(entry()) ? "outline-eye" : "outline-eye-slash"} />
            {language.t(actions.unread(entry()) ? "sidebar.projects.markRead" : "sidebar.projects.markUnread")}
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
