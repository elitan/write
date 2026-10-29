import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Modal shell: dimmed overlay, Esc / outside-click to close, and focus
 * returns to wherever it was when the dialog opened.
 */
export function Dialog({
  onClose,
  children,
  className = "",
  align = "center",
  label,
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  align?: "center" | "top";
  label: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus the first field, else the panel itself.
    const first = panel.current?.querySelector<HTMLElement>(
      "[autofocus], input, textarea",
    );
    (first ?? panel.current)?.focus();
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex justify-center px-4 ${
        align === "top" ? "items-start pt-[14vh]" : "items-center"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="anim-overlay pointer-events-none fixed inset-0 bg-[var(--overlay)]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`anim-pop relative w-full overflow-hidden rounded-xl bg-elevated text-fg shadow-[var(--shadow-pop)] outline-none ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
