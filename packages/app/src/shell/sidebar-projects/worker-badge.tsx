import "./worker-badge.css"

/** Mount only for running workers; the caller owns the count and its localized label. */
export function WorkerBadge(props: { count: number; label: string }) {
  return (
    <span class="project-worker-badge" role="img" aria-label={props.label} title={props.label}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        stroke-width="1"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M7 2.5v2M1 7.5h1.5m9 0H13" />
        <rect x="2.5" y="4.5" width="9" height="7" rx="2" />
        <g class="project-worker-badge-eyes">
          <path d="M5 7.5v1m4-1v1" />
        </g>
      </svg>
      <bdi aria-hidden="true">{props.count}</bdi>
    </span>
  )
}
