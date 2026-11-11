import { Option, Schema } from "effect"

const Registration = Schema.fromJsonString(Schema.Struct({ pid: Schema.Int }))

/** Preserve registered processes unless the operating system confirms they have exited. */
export function hasRunningService(text: string) {
  const registration = Option.getOrUndefined(Schema.decodeUnknownOption(Registration)(text))
  if (!registration || registration.pid <= 0) return true

  try {
    process.kill(registration.pid, 0)
    return true
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH")
  }
}
