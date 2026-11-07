import { createMemo, Match, Show, Switch } from "solid-js"
import { ActivityRing } from "@opencode/ui/activity-ring"
import { ContextMenu } from "@opencode/ui/context-menu"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLanguage } from "@/runtime/i18n/language"
import { inboxArchived, type InboxEntry } from "@/shell/titlebar/inbox-model"
import { sessionTabTitle } from "@/shell/titlebar/tab-title"
import { useDraggable } from "@dnd-kit/solid"
import { projectKey, useSidebarProjects } from "./state"
import { sessionActivity } from "./session-activity"
import { useProjectSessionActions } from "./session-actions"
import { openContextMenuFromKeyboard } from "./keyboard"
import { PinIcon } from "./pin-icon"
import { WorkerBadge } from "./worker-badge"

/**
 * A root session under its project. The trailing mark follows the session tabs: a ring while working, a warning dot
 * while it waits for an answer, and a dot for unread results. Hover and focus reveal Pin and Archive in its place; a
 * filled pin in the indent marks pinned rows at rest. Unarchived rows drag onto another ProjectRow.
 */
export function SessionRow(props: { entry: InboxEntry; worktree: string; selected: boolean; onOpen: () => void }) {
  const language = useLanguage()
  const sidebar = useSidebarProjects()
  const actions = useProjectSessionActions()
  const activity = createMemo(() => sessionActivity(props.entry.ctx.data, props.entry.session.id))

  const draggable = useDraggable({
    get id() {
      return props.entry.key
    },
    type: "session",
    // Archived sessions are read-only history; moving one would only surprise when it is restored.
    get disabled() {
      return inboxArchived(props.entry)
    },
    get data() {
      return {
        entry: props.entry,
        server: props.entry.server,
        projectKey: projectKey(props.entry.server, props.worktree),
      }
    },
  })

  const status = () => props.entry.status
  const unread = () => status() !== "ready" && status() !== "working"
  const pinned = () => sidebar.state.pinned(props.entry.server, props.entry.session.id)
  const archived = () => inboxArchived(props.entry)
  const pending = () => actions.pending(props.entry)
  const pinLabel = () => language.t(pinned() ? "sidebar.projects.unpin" : "sidebar.projects.pin")
  const archiveLabel = () => language.t(archived() ? "sidebar.projects.unarchive" : "sidebar.projects.archive")
  const togglePin = () => sidebar.state.togglePin(props.entry.server, props.entry.session, props.worktree)
  const toggleArchive = () => void actions.archive(props.entry)

  const label = () => {
    const value = status()

    return value === "ready" ? undefined : language.t(`sidebar.inbox.status.${value}`)
  }

  return (
    <div data-slot="sidebar-projects-session-item" class="group/session relative flex shrink-0 flex-col">
      <ContextMenu>
        <ContextMenu.Trigger
          as="button"
          ref={draggable.ref}
          type="button"
          role="treeitem"
          data-slot="sidebar-projects-session"
          data-status={status()}
          data-state={props.selected ? "active" : undefined}
          aria-current={props.selected ? "page" : undefined}
          class="relative flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] ps-[30px] pe-1.5 text-start text-[13px] leading-4 hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover data-[state=active]:bg-v2-background-bg-layer-02"
          onClick={props.onOpen}
          onKeyDown={openContextMenuFromKeyboard}
        >
          <Show when={pinned()}>
            {/* The indent under the project glyph is otherwise empty, so the marker costs the title no width. */}
            <span class="absolute start-2.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-v2-icon-icon-faint">
              <PinIcon filled />
            </span>
          </Show>
          <span
            dir="auto"
            class="min-w-0 flex-1 truncate group-hover/session:pe-11 group-focus-within/session:pe-11"
            // Rows recede once read so unread results stand out, as in the inbox.
            classList={{
              "font-medium text-v2-text-text-base": unread() || props.selected,
              "text-v2-text-text-muted": !unread() && !props.selected,
            }}
          >
            {sessionTabTitle(props.entry.session.title, language.t("session.tab.session"))}
          </span>
          {/* The actions take the status mark's place while the row is hovered or focused. */}
          <span class="flex shrink-0 items-center group-hover/session:hidden group-focus-within/session:hidden">
            <Switch>
              <Match when={status() === "working"}>
                <Show
                  when={activity().workers > 0}
                  fallback={
                    <span class="flex size-4 shrink-0 items-center justify-center">
                      <ActivityRing />
                    </span>
                  }
                >
                  <WorkerBadge
                    count={activity().workers}
                    label={language.plural(
                      activity().main ? "sidebar.projects.workers.running" : "sidebar.projects.workers.waiting",
                      activity().workers,
                    )}
                  />
                </Show>
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
          </span>
          <span class="sr-only">{label()}</span>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            <ContextMenu.Item onSelect={props.onOpen}>{language.t("common.open")}</ContextMenu.Item>
            <ContextMenu.Item onSelect={togglePin}>{pinLabel()}</ContextMenu.Item>
            <ContextMenu.Item disabled={pending()} onSelect={() => void actions.fork(props.entry)}>
              {language.t("sidebar.projects.fork")}
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => void actions.copyID(props.entry)}>
              {language.t("sidebar.projects.copyID")}
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item disabled={pending()} onSelect={toggleArchive}>
              {archiveLabel()}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
      {/* Siblings of the row, not children: a button cannot nest buttons, and the drag handle stays the row alone. */}
      <div class="absolute end-1 top-1 flex items-center gap-0.5 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100">
        <Tooltip value={pinLabel()} placement="top">
          <IconButton
            type="button"
            data-no-dnd
            size="small"
            variant="ghost-muted"
            aria-label={pinLabel()}
            aria-pressed={pinned()}
            icon={<PinIcon off={pinned()} />}
            onClick={togglePin}
          />
        </Tooltip>
        <Tooltip value={archiveLabel()} placement="top">
          <IconButton
            type="button"
            data-no-dnd
            size="small"
            variant="ghost-muted"
            disabled={pending()}
            aria-label={archiveLabel()}
            icon={<Icon name="archive" size="small" />}
            onClick={toggleArchive}
          />
        </Tooltip>
      </div>
    </div>
  )
}
