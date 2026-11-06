import { Dock } from "./dock"
import { ProjectTree } from "./project-tree"
import { SidebarProjectsProvider } from "./state"

/** The experimental Projects interface mode: a project tree on top and a dock of live sessions below. */
export function SidebarProjects() {
  return (
    <SidebarProjectsProvider>
      <div data-slot="sidebar-projects" class="flex min-h-0 flex-1 flex-col">
        <ProjectTree />
        <Dock />
      </div>
    </SidebarProjectsProvider>
  )
}
