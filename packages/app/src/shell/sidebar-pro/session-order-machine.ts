export * as SessionOrder from "./session-order-machine"

/** Ephemeral project order, independent of the session objects that keep receiving live updates. */
export type State = ({ type: "idle" } | { type: "busy" }) & {
  archived: boolean
  pinned: string[]
  unpinned: string[]
}

type Event = {
  type: "reconcile"
  busy: boolean
  archived: boolean
  /** Current membership, newest first within each section. */
  pinned: string[]
  unpinned: string[]
}

export function transition(state: State, event: Event): State {
  const freeze = event.busy && state.archived === event.archived
  const pinned = freeze ? reconcileSection(state.pinned, event.pinned) : event.pinned
  const unpinned = freeze ? reconcileSection(state.unpinned, event.unpinned) : event.unpinned
  const type = event.busy ? "busy" : "idle"

  if (
    state.type === type &&
    state.archived === event.archived &&
    same(state.pinned, pinned) &&
    same(state.unpinned, unpinned)
  )
    return state

  return { type, archived: event.archived, pinned, unpinned }
}

function reconcileSection(previous: string[], current: string[]) {
  const known = new Set(previous)
  const members = new Set(current)

  // Freeze relative order, never membership: arrivals and newly pinned/unpinned rows lead their own section.
  return [...current.filter((key) => !known.has(key)), ...previous.filter((key) => members.has(key))]
}

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((key, index) => key === b[index])
}
