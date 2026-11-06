import { getProjectAvatarVariant } from "@opencode/ui/project-avatar"
import { Show } from "solid-js"
import { ProjectIcon } from "@/shell/layout/project-icon"
import type { LocalProject } from "@/shell/state/layout"
import { glyphBodies, glyphViewBox, isGlyphName } from "./glyphs"
import { useSidebarProjects, type SidebarProjectsStore } from "./state"

type Glyph = SidebarProjectsStore["store"]["glyphs"][string]

export function GlyphIcon(props: { name: string }) {
  return (
    <Show when={isGlyphName(props.name) ? glyphBodies[props.name] : undefined}>
      {(body) => (
        <svg
          width="16"
          height="16"
          viewBox={glyphViewBox}
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          innerHTML={body()}
          aria-hidden="true"
        />
      )}
    </Show>
  )
}

export function ProjectGlyph(props: { project: LocalProject; projectKey: string; color?: string }) {
  const sidebar = useSidebarProjects()
  const glyph = () => sidebar.state.store.glyphs[props.projectKey]
  const color = () => props.color ?? props.project.icon?.color

  return (
    <Show when={glyph()} fallback={<ProjectIcon project={props.project} class="shrink-0" aria-hidden="true" />}>
      {(value) => (
        <span
          class="project-glyph"
          aria-hidden="true"
          style={{
            // The avatar's bg token turns dark in the dark scheme; its border token stays vivid in both.
            color: color() ? `var(--v2-avatar-border-${getProjectAvatarVariant(color())})` : "var(--v2-text-text-muted)",
          }}
        >
          <GlyphContent glyph={value()} />
        </span>
      )}
    </Show>
  )
}

function GlyphContent(props: { glyph: Glyph }) {
  const glyph = () => props.glyph

  return (
    <Show when={glyph().kind === "emoji"} fallback={<GlyphIcon name={iconName(glyph())} />}>
      {emojiValue(glyph())}
    </Show>
  )
}

function iconName(glyph: Glyph) {
  return glyph.kind === "icon" ? glyph.name : ""
}

function emojiValue(glyph: Glyph) {
  return glyph.kind === "emoji" ? glyph.value : ""
}
