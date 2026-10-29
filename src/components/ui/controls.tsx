import { forwardRef, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { keysOf } from "./kbd";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-fg text-bg hover:opacity-90",
  secondary:
    "bg-surface text-fg border border-line-strong hover:bg-hover shadow-[0_1px_1px_rgb(0_0_0/0.04)]",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg",
  danger: "bg-danger text-white hover:opacity-90",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "sm" | "md";
  }
>(function Button(
  { variant = "secondary", size = "md", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-[background-color,opacity,color] duration-100 disabled:pointer-events-none disabled:opacity-40 ${
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]"
      } ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    shortcut?: string;
    active?: boolean;
  }
>(function IconButton(
  { label, shortcut, active, className = "", children, ...props },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors duration-100 hover:bg-hover hover:text-fg ${
          active ? "bg-hover text-fg" : ""
        } ${className}`}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
});

/** Hover tooltip with a short delay, rendered in a portal so it never clips. */
export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "bottom" | "top" | "right";
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = wrap.current?.firstElementChild;
      if (el) setRect(el.getBoundingClientRect());
    }, 450);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setRect(null);
  };

  let style: React.CSSProperties = {};
  if (rect) {
    if (side === "bottom")
      style = {
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      };
    if (side === "top")
      style = {
        top: rect.top - 6,
        left: rect.left + rect.width / 2,
        transform: "translate(-50%, -100%)",
      };
    if (side === "right")
      style = {
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
        transform: "translateY(-50%)",
      };
  }

  return (
    <span
      ref={wrap}
      className="contents"
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {rect &&
        createPortal(
          <div
            role="tooltip"
            style={style}
            className="anim-overlay pointer-events-none fixed z-[200] flex items-center gap-2 whitespace-nowrap rounded-md bg-elevated px-2 py-1 text-[12px] text-fg shadow-[var(--shadow-pop)]"
          >
            {label}
            {shortcut && (
              <span className="flex gap-0.5 text-fg-subtle">
                {keysOf(shortcut).map((k, i) => (
                  <span key={`${k}${i}`}>{k}</span>
                ))}
              </span>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-150 ${
        checked ? "bg-accent" : "bg-line-strong"
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-150 ease-[var(--ease-out)] ${
          checked ? "translate-x-[12px]" : ""
        }`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-lg bg-hover p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors duration-100 ${
            value === o.value
              ? "bg-surface text-fg shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_0/0.06)]"
              : "text-fg-subtle hover:text-fg"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`h-9 w-full rounded-md border border-line-strong bg-transparent px-3 text-[13px] text-fg outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-fg-faint focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] ${className}`}
      {...props}
    />
  );
});
