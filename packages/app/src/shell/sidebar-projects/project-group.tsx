import { Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useSortable } from "@dnd-kit/solid/sortable"
import { useDroppable } from "@dnd-kit/solid"
import { CollisionPriority } from "@dnd-kit/abstract"
import { ContextMenu } from "@opencode/ui/context-menu"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { PluginConfirmDialog } from "@/runtime/plugin/dialogs"
import { openContextMenuFromKeyboard } from "./keyboard"
import { useSidebarProjects } from "./state"

export const UNGROUPED = "\0ungrouped"

export function GroupNameInput(props: { value?: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const language = useLanguage()

  return (
    <input
      data-no-dnd
      ref={(element) =>
        queueMicrotask(() => {
          element.focus()
          element.select()
        })
      }
      value={props.value ?? ""}
      aria-label={language.t("sidebar.projects.group.name")}
      placeholder={language.t("sidebar.projects.group.name")}
      class="mx-1 h-7 min-w-0 rounded px-1 text-[13px] outline-none bg-v2-background-bg-layer-02"
      onKeyDown={(event) => {
        event.stopPropagation()

        if (event.key === "Escape") props.onCancel()

        if (event.key !== "Enter") return
        const name = event.currentTarget.value.trim()

        if (name) props.onCommit(name)
      }}
      onBlur={props.onCancel}
    />
  )
}

export function ProjectGroup(props: {
  id: string
  index: number
  name: string
  headed: boolean
  collapsed: boolean
  empty: boolean
  children: JSX.Element
}) {
  const sidebar = useSidebarProjects()
  const language = useLanguage()
  const dialog = useDialog()
  const [store, setStore] = createStore({ editing: false })

  const sortable = useSortable({
    get id() {
      return props.id
    },
    get index() {
      return props.index
    },
    type: "group",
    accept: "group",
    get disabled() {
      return props.id === UNGROUPED
    },
  })

  const body = useDroppable({
    get id() {
      return `group-body:${props.id}`
    },
    type: "group-body",
    accept: "project",
    collisionPriority: CollisionPriority.Low,
    get data() {
      return { group: props.id }
    },
    get disabled() {
      return props.collapsed
    },
  })

  const remove = () =>
    void dialog.show(() => (
      <PluginConfirmDialog
        options={{
          title: language.t("sidebar.projects.group.delete"),
          description: language.t("sidebar.projects.group.deleteConfirm", { name: props.name }),
          danger: true,
        }}
        done={(confirmed) => {
          if (confirmed) sidebar.state.removeGroup(props.id)
          dialog.close()
        }}
      />
    ))

  return (
    <div
      ref={sortable.ref}
      data-slot="sidebar-projects-group"
      role="group"
      aria-label={props.name}
      // Without a heading the group itself is the drag activator, which dnd-kit would make a tab stop.
      tabIndex={props.headed ? undefined : -1}
      class="flex shrink-0 flex-col gap-px"
    >
      <Show when={props.headed}>
        <Show
          when={store.editing}
          fallback={
            <ContextMenu>
              <ContextMenu.Trigger
                as="button"
                type="button"
                ref={sortable.handleRef}
                data-slot="sidebar-projects-group-header"
                aria-expanded={!props.collapsed}
                class="flex h-7 w-full items-center gap-1 rounded-[6px] px-1.5 text-start text-[12px] leading-4 font-semibold text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
                onClick={() => {
                  if (props.id !== UNGROUPED) sidebar.state.toggleGroup(props.id)
                }}
                onKeyDown={openContextMenuFromKeyboard}
                onDblClick={() => {
                  if (props.id !== UNGROUPED) setStore("editing", true)
                }}
              >
                <span class="min-w-0 flex-1 truncate">{props.name}</span>
                <Show when={props.id !== UNGROUPED}>
                  <Icon name="chevron-down" size="small" classList={{ "-rotate-90": props.collapsed }} />
                </Show>
              </ContextMenu.Trigger>
              <Show when={props.id !== UNGROUPED}>
                <ContextMenu.Portal>
                  <ContextMenu.Content>
                    <ContextMenu.Item onSelect={() => setStore("editing", true)}>
                      {language.t("sidebar.projects.group.rename")}
                    </ContextMenu.Item>
                    <ContextMenu.Item onSelect={remove}>{language.t("sidebar.projects.group.delete")}</ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </Show>
            </ContextMenu>
          }
        >
          <GroupNameInput
            value={props.name}
            onCancel={() => setStore("editing", false)}
            onCommit={(name) => {
              sidebar.state.renameGroup(props.id, name)
              setStore("editing", false)
            }}
          />
        </Show>
      </Show>
      <Show when={!props.collapsed}>
        <div
          ref={body.ref}
          class="flex min-h-5 flex-col gap-px rounded"
          classList={{ "bg-v2-overlay-simple-overlay-hover": body.isDropTarget() }}
        >
          <Show
            when={!props.empty}
            fallback={
              <div class="flex h-6 items-center px-1.5 text-[12px] leading-4 text-v2-text-text-faint">
                {language.t("sidebar.projects.group.empty")}
              </div>
            }
          >
            {props.children}
          </Show>
        </div>
      </Show>
    </div>
  )
}
