import { Show } from "solid-js"
import { Dock } from "./dock"
import { ProjectTree } from "./project-tree"
import { SidebarProProvider, useSidebarPro } from "./state"

/** Sidebar Pro: a project tree on top and a dock of live sessions below. */
export function SidebarPro() {
  return (
    <SidebarProProvider>
      <SidebarProContent />
    </SidebarProProvider>
  )
}

function SidebarProContent() {
  const sidebar = useSidebarPro()
  return (
    <div data-slot="sidebar-projects" class="flex min-h-0 flex-1 flex-col">
      <Show when={sidebar.state.ready()}>
        <ProjectTree />
        <Dock />
      </Show>
    </div>
  )
}
