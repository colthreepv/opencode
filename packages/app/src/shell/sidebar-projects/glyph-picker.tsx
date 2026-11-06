import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import {
  displayName,
  getProjectAvatarVariant,
  ProjectAvatar,
  PROJECT_AVATAR_VARIANTS,
} from "@opencode/ui/project-avatar"
import { TextInput } from "@opencode/ui/text-input"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { createEditProjectModel } from "@/settings/workspaces/project-model"
import type { LocalProject } from "@/shell/state/layout"
import { GlyphIcon, ProjectGlyph } from "./glyph"
import { glyphNames } from "./glyphs"
import { useSidebarProjects } from "./state"
import "./glyph-picker.css"

export function GlyphPicker(props: { project: LocalProject; server: ServerConnection.Any; projectKey: string }) {
  const language = useLanguage()
  const sidebar = useSidebarProjects()
  const model = createEditProjectModel(props)
  const [store, setStore] = createStore({ search: "", emoji: "", active: -1 })
  let grid!: HTMLDivElement

  const icons = createMemo(() => glyphNames.filter((name) => name.includes(store.search.trim().toLowerCase())))

  const selected = (name: string) => {
    const glyph = sidebar.state.store.glyphs[props.projectKey]

    return glyph?.kind === "icon" && glyph.name === name
  }

  // Roving tab stop: the selected icon when visible, else the last one the arrows reached.
  const focusable = () => {
    const index = icons().findIndex(selected)

    return store.active >= 0 && store.active < icons().length ? store.active : Math.max(0, index)
  }

  const emoji = (value: string) => {
    const first =
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)[Symbol.iterator]().next().value
        ?.segment ?? ""

    setStore("emoji", first)

    if (first && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Presentation}|\u20e3/u.test(first))
      sidebar.state.setGlyph(props.projectKey, { kind: "emoji", value: first })
  }

  const navigate = (event: KeyboardEvent) => {
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button")]
    const current = buttons.findIndex((button) => button === event.target)

    if (current < 0) return
    // Columns follow the wrapped layout: count the cells on the first row.
    const columns = Math.max(1, buttons.filter((button) => button.offsetTop === buttons[0]?.offsetTop).length)
    const rtl = getComputedStyle(grid).direction === "rtl"

    const next = {
      ArrowRight: current + (rtl ? -1 : 1),
      ArrowLeft: current + (rtl ? 1 : -1),
      ArrowDown: current + columns,
      ArrowUp: current - columns,
      Home: 0,
      End: buttons.length - 1,
    }[event.key]

    if (next === undefined) return
    event.preventDefault()
    const index = Math.min(Math.max(next, 0), buttons.length - 1)
    setStore("active", index)
    buttons[index]?.focus()
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("sidebar.projects.glyph.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="glyph-picker">
        <div class="glyph-picker-preview">
          <ProjectGlyph project={props.project} projectKey={props.projectKey} color={model.store.color} />
          <bdi class="min-w-0 truncate">{displayName(props.project)}</bdi>
        </div>
        <div class="glyph-picker-field">
          <TextInput
            type="search"
            appearance="large"
            class="!w-full"
            leadingIcon={<Icon name="magnifying-glass" size="small" />}
            value={store.search}
            placeholder={language.t("sidebar.projects.glyph.search")}
            aria-label={language.t("sidebar.projects.glyph.search")}
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => {
              setStore({ search: event.currentTarget.value, active: -1 })
            }}
          />
          <Show
            when={icons().length > 0}
            fallback={<div class="glyph-picker-empty">{language.t("sidebar.projects.glyph.noResults")}</div>}
          >
            <div
              ref={grid}
              class="glyph-picker-grid"
              role="group"
              aria-label={language.t("sidebar.projects.glyph.search")}
              data-scrollable
              onKeyDown={navigate}
            >
              <For each={icons()}>
                {(name, index) => (
                  <button
                    type="button"
                    class="glyph-picker-cell"
                    title={name}
                    aria-label={name}
                    aria-pressed={selected(name)}
                    tabIndex={index() === focusable() ? 0 : -1}
                    onFocus={() => setStore("active", index())}
                    onClick={() => sidebar.state.setGlyph(props.projectKey, { kind: "icon", name })}
                  >
                    <GlyphIcon name={name} />
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
        <label class="glyph-picker-row">
          <span class="glyph-picker-label">{language.t("sidebar.projects.glyph.emoji")}</span>
          <TextInput
            appearance="base"
            class="glyph-picker-emoji"
            value={store.emoji}
            aria-label={language.t("sidebar.projects.glyph.emoji")}
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => emoji(event.currentTarget.value)}
          />
        </label>
        <div class="glyph-picker-row">
          <span class="glyph-picker-label">{language.t("sidebar.projects.glyph.color")}</span>
          <div class="glyph-picker-colors">
            <For each={PROJECT_AVATAR_VARIANTS}>
              {(color) => {
                const active = () => !!model.store.color && getProjectAvatarVariant(model.store.color) === color

                return (
                  <button
                    type="button"
                    class="glyph-picker-color"
                    aria-label={language.t("dialog.project.edit.color.select", {
                      color: language.t(`common.color.${color}`),
                    })}
                    aria-pressed={active()}
                    onClick={() => model.setColor(active() ? undefined : color)}
                  >
                    <ProjectAvatar
                      fallback=""
                      variant={color}
                      class="!size-5 [&_[data-slot=project-avatar-surface]]:!rounded-[6px]"
                    />
                    <Show when={active()}>
                      <Icon name="check" size="small" class="glyph-picker-color-check" />
                    </Show>
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => sidebar.state.setGlyph(props.projectKey, undefined)}>
          {language.t("sidebar.projects.glyph.reset")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
