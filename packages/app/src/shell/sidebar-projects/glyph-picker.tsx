import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import {
  displayName,
  getProjectAvatarVariant,
  ProjectAvatar,
  PROJECT_AVATAR_VARIANTS,
} from "@opencode/ui/project-avatar"
import { For } from "solid-js"
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
  const [store, setStore] = createStore({ search: "", emoji: "" })
  const icons = () => glyphNames.filter((name) => name.includes(store.search.trim().toLowerCase()))

  const selected = (name: string) => {
    const glyph = sidebar.state.store.glyphs[props.projectKey]

    return glyph?.kind === "icon" && glyph.name === name
  }

  const emoji = (value: string) => {
    const first =
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)[Symbol.iterator]().next().value
        ?.segment ?? ""

    setStore("emoji", first)

    if (first && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Presentation}|\u20e3/u.test(first))
      sidebar.state.setGlyph(props.projectKey, { kind: "emoji", value: first })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitle>{language.t("sidebar.projects.glyph.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="glyph-picker">
        <div class="glyph-picker-preview">
          <ProjectGlyph project={props.project} projectKey={props.projectKey} color={model.store.color} />
          <span>{displayName(props.project)}</span>
        </div>
        <label class="glyph-picker-label">
          {language.t("sidebar.projects.glyph.search")}
          <input
            type="search"
            value={store.search}
            onInput={(event) => setStore("search", event.currentTarget.value)}
          />
        </label>
        <div class="glyph-picker-grid" data-scrollable>
          <For each={icons()}>
            {(name) => (
              <button
                type="button"
                aria-label={name}
                aria-pressed={selected(name)}
                onClick={() => sidebar.state.setGlyph(props.projectKey, { kind: "icon", name })}
              >
                <GlyphIcon name={name} />
              </button>
            )}
          </For>
        </div>
        <label class="glyph-picker-label">
          {language.t("sidebar.projects.glyph.emoji")}
          <input type="text" value={store.emoji} onInput={(event) => emoji(event.currentTarget.value)} />
        </label>
        <div class="glyph-picker-label">
          {language.t("sidebar.projects.glyph.color")}
          <div class="glyph-picker-colors">
            <For each={PROJECT_AVATAR_VARIANTS}>
              {(color) => (
                <button
                  type="button"
                  aria-label={language.t("dialog.project.edit.color.select", {
                    color: language.t(`common.color.${color}`),
                  })}
                  aria-pressed={!!model.store.color && getProjectAvatarVariant(model.store.color) === color}
                  onClick={() =>
                    model.setColor(
                      model.store.color && getProjectAvatarVariant(model.store.color) === color ? undefined : color,
                    )
                  }
                >
                  <ProjectAvatar fallback="" variant={color} class="!size-5" />
                </button>
              )}
            </For>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => sidebar.state.setGlyph(props.projectKey, undefined)}>
          {language.t("sidebar.projects.glyph.reset")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
