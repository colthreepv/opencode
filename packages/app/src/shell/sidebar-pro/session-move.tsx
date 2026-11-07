import { useDialog } from "@opencode/ui/context/dialog"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useQueryClient } from "@tanstack/solid-query"
import type { SessionInfo } from "@opencode/client/promise"
import { useLanguage } from "@/runtime/i18n/language"
import { inboxBusy, type InboxEntry } from "@/shell/titlebar/inbox-model"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"

export function createSessionMove() {
  const dialog = useDialog()
  const language = useLanguage()
  const query = useQueryClient()

  return async (entry: InboxEntry, directory: string) => {
    const delivery = inboxBusy(entry.status)
      ? await new Promise<"queue" | "steer" | undefined>((resolve) => {
          void dialog.show(
            () => (
              <Dialog fit>
                <DialogHeader hideClose>
                  <DialogTitleGroup
                    title={language.t("sidebar.projects.move.title")}
                    description={language.t("sidebar.projects.move.description")}
                  />
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      resolve(undefined)
                      dialog.close()
                    }}
                  >
                    {language.t("common.cancel")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      resolve("steer")
                      dialog.close()
                    }}
                  >
                    {language.t("sidebar.projects.move.steer")}
                  </Button>
                  <Button
                    autofocus
                    variant="contrast"
                    onClick={() => {
                      resolve("queue")
                      dialog.close()
                    }}
                  >
                    {language.t("sidebar.projects.move.queue")}
                  </Button>
                </DialogFooter>
              </Dialog>
            ),
            () => resolve(undefined),
          )
        })
      : "steer"

    if (!delivery) return
    // The live store applies session.moved only to remembered sessions, including queued moves.
    entry.ctx.data.session.remember(entry.session)
    await entry.ctx.sdk.api.session
      .move({ sessionID: entry.session.id, directory, delivery })
      .then(async () => {
        // Queued moves update on session.moved; an idle move can be refreshed immediately.
        if (delivery === "queue") return
        const response = await entry.ctx.sdk.api.session.get({ sessionID: entry.session.id })
        entry.ctx.data.session.remember(response)
        query.setQueryData<SessionInfo[]>(
          ["inbox-sessions", entry.conn],
          (items) => items && items.map((item) => (item.id === entry.session.id ? response : item)),
        )
      })
      .catch((cause) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(cause, language.t("common.requestFailed")),
        }),
      )
  }
}
