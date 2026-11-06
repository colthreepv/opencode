import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { sessionBusy } from "@/shell/layout/project-avatar-state"

/** Keep the inbox's family-wide status; expose who is busy for the compact sidebar presentation. */
export function sessionActivity(data: InboxEntry["ctx"]["data"], root: string) {
  // Active IDs cover reconnect hydration before the complete family has been loaded.
  const children = new Set([...data.session.family(root), ...data.session.active()])
  children.delete(root)
  let workers = 0
  for (const id of children) {
    if (data.session.root(id) === root && sessionBusy(data, id)) workers++
  }

  return { main: sessionBusy(data, root), workers }
}
