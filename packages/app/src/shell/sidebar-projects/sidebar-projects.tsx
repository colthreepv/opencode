import { Show } from "solid-js"
import { Dock } from "./dock"
import { ProjectTree } from "./project-tree"
import { SidebarProjectsProvider, useSidebarProjects } from "./state"

/** The experimental Projects interface mode: a project tree on top and a dock of live sessions below. */
export function SidebarProjects() {
  return (
    <SidebarProjectsProvider>
      <SidebarProjectsContent />
    </SidebarProjectsProvider>
  )
}

function SidebarProjectsContent() {
  const sidebar = useSidebarProjects()
  return (
    <div data-slot="sidebar-projects" class="flex min-h-0 flex-1 flex-col">
      <Show when={sidebar.state.ready()}>
        <ProjectTree />
        <Dock />
      </Show>
    </div>
  )
}
