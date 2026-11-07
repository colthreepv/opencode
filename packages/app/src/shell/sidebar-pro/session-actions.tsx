import { createStore } from "solid-js/store"
import { useQueryClient } from "@tanstack/solid-query"
import { serializeSessionMention, type SessionMention } from "@opencode/util/session-mention"
import { useLanguage } from "@/runtime/i18n/language"
import { useTabs } from "@/shell/tabs/tabs"
import { notifySessionTabsRemoved } from "@/shell/titlebar/session-events"
import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import { usePlatform } from "@/runtime/platform/platform"
import { useSidebarProState } from "./state"

/** Full-history forks and reversible archival, shared by the tree and the conversation header. */
export function useSidebarProSessionActions() {
  const language = useLanguage()
  const platform = usePlatform()
  const tabs = useTabs()
  const queries = useQueryClient()
  const state = useSidebarProState()
  const [store, setStore] = createStore<{ pending: Record<string, boolean> }>({ pending: {} })

  const request = (entry: InboxEntry, action: () => Promise<void>) => {
    if (store.pending[entry.key]) return Promise.resolve()
    setStore("pending", entry.key, true)

    return action()
      .catch((cause) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(cause, language.t("common.requestFailed")),
        }),
      )
      .finally(() => setStore("pending", entry.key, false))
  }

  const invalidate = (entry: InboxEntry) =>
    Promise.all([
      queries.invalidateQueries({ queryKey: ["inbox-sessions", entry.conn] }),
      queries.invalidateQueries({ queryKey: ["inbox-archived-sessions", entry.conn] }),
      queries.invalidateQueries({ queryKey: ["sidebar-projects-archived", entry.server] }),
      queries.invalidateQueries({ queryKey: ["sidebar-projects-sessions", entry.server] }),
    ]).then(() => undefined)

  const copy = (text: string) =>
    Promise.resolve()
      .then(() => {
        if (platform.writeClipboardText) return platform.writeClipboardText(text)

        if (navigator.clipboard) return navigator.clipboard.writeText(text)

        // Clipboard API is unavailable on plain HTTP LAN origins. Keep copying usable there too.
        const focused = document.activeElement
        const field = document.createElement("textarea")
        field.value = text
        field.style.position = "fixed"
        field.style.opacity = "0"
        document.body.append(field)
        field.select()
        const copied = document.execCommand("copy")

        field.remove()

        if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })

        if (!copied) throw new Error(language.t("toast.session.copy.failed.description"))
      })
      .then(() =>
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("common.copied"),
          description: text,
        }),
      )
      .catch((cause) =>
        showToast({
          variant: "error",
          title: language.t("toast.session.copy.failed.title"),
          description: errorMessage(cause, language.t("toast.session.copy.failed.description")),
        }),
      )

  const unread = (entry: InboxEntry) =>
    state.unread(entry.server, entry.session.id) ||
    entry.ctx.notification.session.unread(entry.session.id, entry.session)

  const markRead = (entry: InboxEntry) => {
    state.clearUnread(entry.server, entry.session.id)
    // Paginated rows may not be in the live store yet; markViewed reads that store, not the index.
    if (!entry.ctx.data.session.get(entry.session.id)) entry.ctx.data.session.remember(entry.session)
    entry.ctx.notification.session.markViewed(entry.session.id)
  }

  return {
    pending: (entry: InboxEntry) => !!store.pending[entry.key],
    ready: state.ready,
    unread,
    markRead,
    toggleUnread: (entry: InboxEntry) =>
      unread(entry) ? markRead(entry) : state.markUnread(entry.server, entry.session.id),
    copyID: (entry: InboxEntry) => copy(entry.session.id),
    // The generated HTTP client erases the Session ID brand; server-created IDs retain their `ses_` prefix.
    copyReference: (entry: InboxEntry) =>
      copy(serializeSessionMention({ id: entry.session.id as SessionMention["id"] })),
    fork: (entry: InboxEntry) =>
      request(entry, async () => {
        // No `before`: copy through the current end, rather than restoring a user prompt into the composer.
        const session = await entry.ctx.sdk.api.session.fork({ sessionID: entry.session.id })
        entry.ctx.data.session.remember(session)
        entry.ctx.projects.touch(entry.ctx.projects.forSession(session)?.worktree ?? session.location.directory)
        tabs.select(tabs.addSessionTab({ server: entry.server, sessionId: session.id }))
        await invalidate(entry)
      }),
    archive: (entry: InboxEntry) =>
      request(entry, async () => {
        const archived = entry.session.time.archived === undefined
        await entry.ctx.sdk.api.session.update({ sessionID: entry.session.id, archived })
        // Remember immediately as paginated rows may not yet be in the live data store.
        const session = entry.ctx.data.session.get(entry.session.id) ?? entry.session
        entry.ctx.data.session.remember({
          ...session,
          time: { ...session.time, archived: archived ? Date.now() : undefined },
        })

        if (archived)
          notifySessionTabsRemoved({
            server: entry.server,
            directory: entry.session.location.directory,
            sessionIDs: [entry.session.id],
          })
        await invalidate(entry)
      }),
  }
}
