export function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full"
      style={{ paddingTop: 52 }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 512 512"
        fill="none"
        className="mb-12 opacity-20"
      >
        <rect width="512" height="512" rx="108" fill="currentColor" />
        <path
          d="M140 156C140 149.373 145.373 144 152 144H320C326.627 144 332 149.373 332 156C332 162.627 326.627 168 320 168H152C145.373 168 140 162.627 140 156Z"
          fill="var(--color-bg)"
        />
        <path
          d="M140 216C140 209.373 145.373 204 152 204H280C286.627 204 292 209.373 292 216C292 222.627 286.627 228 280 228H152C145.373 228 140 222.627 140 216Z"
          fill="var(--color-bg)"
          fillOpacity="0.6"
        />
        <path
          d="M140 276C140 269.373 145.373 264 152 264H240C246.627 264 252 269.373 252 276C252 282.627 246.627 288 240 288H152C145.373 288 140 282.627 140 276Z"
          fill="var(--color-bg)"
          fillOpacity="0.4"
        />
        <path
          d="M140 336C140 329.373 145.373 324 152 324H200C206.627 324 212 329.373 212 336C212 342.627 206.627 348 200 348H152C145.373 348 140 342.627 140 336Z"
          fill="var(--color-bg)"
          fillOpacity="0.2"
        />
      </svg>

      <div className="flex flex-col gap-3 text-[13px] text-[var(--color-muted)]">
        <Shortcut keys={["⌘", "N"]} label="New" />
        <Shortcut keys={["⌘", "K"]} label="Search" />
        <Shortcut keys={["⌘", ","]} label="Settings" />
      </div>
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="w-6 h-6 flex items-center justify-center text-[11px] bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded-md"
          >
            {key}
          </kbd>
        ))}
      </div>
      <span>{label}</span>
    </div>
  );
}
