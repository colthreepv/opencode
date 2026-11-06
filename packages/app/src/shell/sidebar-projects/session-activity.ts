import type { InboxEntry } from "@/shell/titlebar/inbox-model"
import { sessionBusy } from "@/shell/layout/project-avatar-state"
import { workingSince } from "@/shell/titlebar/inbox-working"

/** Keep the inbox's family-wide status; expose who is busy for the compact sidebar presentation. */
export function sessionActivity(data: InboxEntry["ctx"]["data"], root: string) {
  // Active IDs cover reconnect hydration before the complete family has been loaded.
  const children = new Set([...data.session.family(root), ...data.session.active()])
  children.delete(root)
  let workers = 0
  let since: number | undefined
  for (const id of children) {
    if (data.session.root(id) !== root || !sessionBusy(data, id)) continue
    workers++
    const info = data.session.get(id)
    const start = info && workingSince(info)
    if (start !== undefined) since = Math.min(since ?? start, start)
  }

  return { main: sessionBusy(data, root), workers, since }
}
