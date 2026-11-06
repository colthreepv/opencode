import { Match, Switch } from "solid-js"
import { ActivityRing } from "@opencode/ui/activity-ring"
import { useLanguage } from "@/runtime/i18n/language"
import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { sessionTabTitle } from "@/shell/titlebar/tab-title"

/**
 * A root session under its project. The trailing mark follows the session tabs: a ring while working, a warning dot
 * while it waits for an answer, and a dot for unread results. Phase 5 makes it draggable onto another ProjectRow.
 */
export function SessionRow(props: { entry: InboxEntry; selected: boolean; onOpen: () => void }) {
  const language = useLanguage()
  const status = () => props.entry.status
  const unread = () => status() !== "ready" && status() !== "working"

  const label = () => {
    const value = status()

    return value === "ready" ? undefined : language.t(`sidebar.inbox.status.${value}`)
  }

  return (
    <button
      type="button"
      role="treeitem"
      data-slot="sidebar-projects-session"
      data-status={status()}
      data-state={props.selected ? "active" : undefined}
      aria-current={props.selected ? "page" : undefined}
      class="flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] ps-[30px] pe-1.5 text-start text-[13px] leading-4 hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover data-[state=active]:bg-v2-background-bg-layer-02"
      onClick={props.onOpen}
    >
      <span
        dir="auto"
        class="min-w-0 flex-1 truncate"
        // Rows recede once read so unread results stand out, as in the inbox.
        classList={{
          "font-medium text-v2-text-text-base": unread() || props.selected,
          "text-v2-text-text-muted": !unread() && !props.selected,
        }}
      >
        {sessionTabTitle(props.entry.session.title, language.t("session.tab.session"))}
      </span>
      <Switch>
        <Match when={status() === "working"}>
          <span class="flex size-4 shrink-0 items-center justify-center">
            <ActivityRing />
          </span>
        </Match>
        <Match when={status() !== "ready"}>
          <span class="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
            <span
              class="size-[7px] rounded-full"
              classList={{
                "bg-v2-state-fg-warning": status() === "approval" || status() === "input",
                "bg-v2-state-fg-danger": status() === "failed",
                "bg-v2-background-bg-accent": status() === "done",
              }}
            />
          </span>
        </Match>
      </Switch>
      <span class="sr-only">{label()}</span>
    </button>
  )
}
