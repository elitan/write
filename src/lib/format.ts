const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDay = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const fullDate = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const full = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Compact timestamp for list rows: "now", "5m", "3h", "Tue", "Mar 4", "2023". */
export function shortTime(ms: number, now = Date.now()) {
  const diff = now - ms;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 6 * DAY) return weekday.format(ms);
  const date = new Date(ms);
  if (date.getFullYear() === new Date(now).getFullYear()) {
    return monthDay.format(ms);
  }
  return String(date.getFullYear());
}

/** Sentence form for the editor header: "Edited just now", "Edited 5 minutes ago". */
export function editedAgo(ms: number, now = Date.now()) {
  const diff = now - ms;
  if (diff < MINUTE) return "Edited just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `Edited ${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `Edited ${h} hour${h === 1 ? "" : "s"} ago`;
  }
  return `Edited ${fullDate.format(ms)}`;
}

export function fullTime(ms: number) {
  return full.format(ms);
}

export function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}
