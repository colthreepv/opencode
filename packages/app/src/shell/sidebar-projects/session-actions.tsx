import { createStore } from "solid-js/store"
import { useQueryClient } from "@tanstack/solid-query"
import { useLanguage } from "@/runtime/i18n/language"
import { useTabs } from "@/shell/tabs/tabs"
import { notifySessionTabsRemoved } from "@/shell/titlebar/session-events"
import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import { usePlatform } from "@/runtime/platform/platform"

/** Full-history forks and reversible archival, shared by the tree and the conversation header. */
export function useProjectSessionActions() {
  const language = useLanguage()
  const platform = usePlatform()
  const tabs = useTabs()
  const queries = useQueryClient()
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

  return {
    pending: (entry: InboxEntry) => !!store.pending[entry.key],
    copyID: (entry: InboxEntry) =>
      Promise.resolve()
        .then(() => {
          if (platform.writeClipboardText) return platform.writeClipboardText(entry.session.id)

          if (navigator.clipboard) return navigator.clipboard.writeText(entry.session.id)

          // Clipboard API is unavailable on plain HTTP LAN origins. Keep copying usable there too.
          const focused = document.activeElement
          const field = document.createElement("textarea")
          field.value = entry.session.id
          field.style.position = "fixed"
          field.style.opacity = "0"
          document.body.append(field)
          field.select()
          const copied = document.execCommand("copy")

          field.remove()

          if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })

          if (!copied) throw new Error(language.t("toast.session.copyID.failed.description"))
        })
        .then(() =>
          showToast({
            variant: "success",
            icon: "circle-check",
            title: language.t("common.copied"),
            description: entry.session.id,
          }),
        )
        .catch((cause) =>
          showToast({
            variant: "error",
            title: language.t("toast.session.copyID.failed.title"),
            description: errorMessage(cause, language.t("toast.session.copyID.failed.description")),
          }),
        ),
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
