import { modKey } from "../../lib/platform";

/** Display form of a shortcut: "mod+shift+k" → ["⌘", "⇧", "K"]. */
export function keysOf(shortcut: string) {
  return shortcut.split("+").map((k) => {
    switch (k) {
      case "mod":
        return modKey;
      case "shift":
        return "⇧";
      case "alt":
        return "⌥";
      case "ctrl":
        return "⌃";
      case "enter":
        return "↵";
      case "backspace":
        return "⌫";
      case "tab":
        return "Tab";
      case "esc":
        return "Esc";
      case "up":
        return "↑";
      case "down":
        return "↓";
      case "plus":
        return "+";
      case "minus":
        return "−";
      default:
        return k.length === 1 ? k.toUpperCase() : k;
    }
  });
}

export function Kbd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line bg-hover px-1 text-[11px] font-medium leading-none text-fg-subtle ${className}`}
    >
      {children}
    </kbd>
  );
}

export function Shortcut({
  keys,
  className = "",
}: {
  keys: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`}>
      {keysOf(keys).map((k, i) => (
        <Kbd key={`${k}${i}`}>{k}</Kbd>
      ))}
    </span>
  );
}
