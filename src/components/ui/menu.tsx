import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Shortcut } from "./kbd";

export type MenuItem =
  | {
      label: string;
      icon?: React.ReactNode;
      shortcut?: string;
      danger?: boolean;
      checked?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { separator: true }
  | { heading: string };

export type MenuAnchor = { x: number; y: number } | DOMRect;

/** Dropdown / context menu with full keyboard support. */
export function Menu({
  anchor,
  items,
  onClose,
  align = "start",
  width = 220,
}: {
  anchor: MenuAnchor;
  items: MenuItem[];
  onClose: () => void;
  align?: "start" | "end";
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const actionable = items
    .map((item, i) => ("onSelect" in item && !item.disabled ? i : -1))
    .filter((i) => i !== -1);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    origin: string;
  } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const isRect = "width" in anchor;
    let left = isRect
      ? align === "end"
        ? anchor.right - width
        : anchor.left
      : anchor.x;
    let top = isRect ? anchor.bottom + 4 : anchor.y;
    let originY = "top";
    if (top + h > window.innerHeight - 8) {
      top = isRect ? anchor.top - h - 4 : anchor.y - h;
      originY = "bottom";
    }
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, top);
    setPos({
      left,
      top,
      origin: `${originY} ${align === "end" ? "right" : "left"}`,
    });
    el.focus();
  }, [anchor, align, width]);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onBlur() {
      onClose();
    }
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  const run = (i: number) => {
    const item = items[i];
    if (item && "onSelect" in item && !item.disabled) {
      onClose();
      item.onSelect();
    }
  };

  function onKeyDown(e: React.KeyboardEvent) {
    const at = actionable.indexOf(active);
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      setActive(actionable[(at + 1) % actionable.length]);
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      setActive(actionable[(at - 1 + actionable.length) % actionable.length]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (active !== -1) run(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{
        width,
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        ["--origin" as string]: pos?.origin,
      }}
      className={`fixed z-[150] rounded-lg bg-elevated p-1 text-[13px] shadow-[var(--shadow-pop)] outline-none ${pos ? "anim-menu" : ""}`}
    >
      {items.map((item, i) => {
        if ("separator" in item)
          return <div key={`sep${i}`} className="mx-1 my-1 h-px bg-line" />;
        if ("heading" in item)
          return (
            <div
              key={`h${i}`}
              className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-fg-subtle"
            >
              {item.heading}
            </div>
          );
        return (
          <div
            key={`${item.label}${i}`}
            role="menuitem"
            aria-disabled={item.disabled}
            onPointerMove={() => !item.disabled && setActive(i)}
            onPointerLeave={() => setActive(-1)}
            onClick={() => run(i)}
            className={`flex h-8 items-center gap-2.5 rounded-md px-2 ${
              item.disabled ? "opacity-40" : ""
            } ${active === i ? (item.danger ? "bg-danger/12 text-danger" : "bg-hover text-fg") : item.danger ? "text-danger" : "text-fg-muted"}`}
          >
            {item.icon && (
              <span className="flex size-4 items-center justify-center opacity-80">
                {item.icon}
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.checked && (
              <span className="size-1.5 rounded-full bg-accent" />
            )}
            {item.shortcut && (
              <Shortcut keys={item.shortcut} className="opacity-80" />
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
