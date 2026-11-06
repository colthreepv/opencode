import { For, type ParentProps } from "solid-js"
import "./preview.css"

// A group heading, its projects with one expanded, then a second group.
const tree = [
  { kind: "heading" },
  { kind: "project", width: 58 },
  { kind: "session", width: 64, active: true },
  { kind: "session", width: 48 },
  { kind: "project", width: 46 },
  { kind: "heading" },
  { kind: "project", width: 52 },
] as const

const dock = [
  { width: 60, status: "approval" },
  { width: 50, status: "working" },
] as const

/** Settings > Interface preview of the Projects mode; the shared workspace drawing comes in as children. */
export function SidebarProjectsPreview(props: ParentProps) {
  return (
    <div data-slot="preview-body">
      <div data-slot="preview-rail" data-variant="projects">
        <div data-slot="preview-tree">
          <For each={tree}>
            {(row) =>
              row.kind === "heading" ? (
                <span data-slot="preview-rail-heading" />
              ) : (
                <span
                  data-slot="preview-tab"
                  data-indent={row.kind === "session" ? "" : undefined}
                  data-active={"active" in row ? "" : undefined}
                >
                  <i data-kind={row.kind} />
                  <span style={{ width: `${row.width}%` }} />
                </span>
              )
            }
          </For>
        </div>
        <div data-slot="preview-dock">
          <For each={dock}>
            {(row) => (
              <span data-slot="preview-tab">
                <i data-status={row.status} />
                <span style={{ width: `${row.width}%` }} />
              </span>
            )}
          </For>
        </div>
      </div>
      {props.children}
    </div>
  )
}
