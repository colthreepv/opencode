/**
 * Bottom region of the Projects sidebar: Ongoing and NeedsAttention sessions from the shared inbox
 * (`useSidebarProjects().inbox`), at most half the sidebar height. Empty until Phase 4.
 */
export function Dock() {
  return <div data-slot="sidebar-projects-dock" class="flex shrink-0 flex-col" />
}
