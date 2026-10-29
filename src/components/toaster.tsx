import { CircleAlert, X } from "lucide-react";
import { dismissToast, holdToasts, useUi } from "../store/ui";

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-1/2 z-[180] flex -translate-x-1/2 flex-col items-center gap-2"
      onPointerEnter={() => holdToasts(true)}
      onPointerLeave={() => holdToasts(false)}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="anim-toast pointer-events-auto flex h-10 items-center gap-3 rounded-lg bg-elevated pr-1.5 pl-3.5 text-[13px] text-fg shadow-[var(--shadow-pop)]"
        >
          {t.tone === "error" && (
            <CircleAlert size={14} className="shrink-0 text-danger" />
          )}
          <span className="max-w-[420px] truncate">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                dismissToast(t.id);
                t.action?.run();
              }}
              className="h-7 rounded-md px-2 font-medium text-accent-text transition-colors hover:bg-hover"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissToast(t.id)}
            className="flex size-6 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
