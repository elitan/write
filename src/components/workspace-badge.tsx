function hue(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export function WorkspaceBadge({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const h = hue(name);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[5px] font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: `linear-gradient(135deg, oklch(0.68 0.14 ${h}), oklch(0.56 0.15 ${(h + 40) % 360}))`,
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.15)",
      }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
