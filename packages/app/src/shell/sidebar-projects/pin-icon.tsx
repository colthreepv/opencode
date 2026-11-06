import { Show } from "solid-js"

/**
 * A pushpin on the 16px grid and 1px stroke of the shared icon set, which has no pin artwork yet. Sized like a small
 * `Icon`. `filled` marks a pinned row; `off` adds the strike for Unpin.
 */
export function PinIcon(props: { filled?: boolean; off?: boolean; class?: string }) {
  return (
    <svg
      data-slot="icon-svg"
      class={props.class}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 2.5H11M6.5 2.5V6.5L4.5 8.5V10.5H11.5V8.5L9.5 6.5V2.5"
        fill={props.filled ? "currentColor" : "none"}
        stroke="currentColor"
      />
      <path d="M8 10.5V14" stroke="currentColor" />
      <Show when={props.off}>
        <path d="M2.5 2.5L13.5 13.5" stroke="currentColor" />
      </Show>
    </svg>
  )
}
