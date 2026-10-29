/** A note file is `# Title` on its first H1 line plus a markdown body. */
export function parseContent(content: string): {
  title: string;
  body: string;
  titleLine: number;
} {
  const lines = content.split("\n");
  const titleLine = lines.findIndex((line) => line.startsWith("# "));
  if (titleLine === -1) return { title: "", body: content, titleLine };
  return {
    title: lines[titleLine].slice(2).trim(),
    body: [...lines.slice(0, titleLine), ...lines.slice(titleLine + 1)].join(
      "\n",
    ),
    titleLine,
  };
}

export function buildContent(title: string, body: string): string {
  return `# ${title.trim()}\n${body}`;
}

export function isBlank(title: string, body: string) {
  return title.trim() === "" && body.trim() === "";
}

export function countWords(source: string): number {
  // Task boxes aren't words.
  const text = source.replace(/\[[ xX]\]/g, " ");
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Whitespace and markdown punctuation separate words.
    const separator =
      code <= 32 ||
      code === 35 || // #
      code === 42 || // *
      code === 45 || // -
      code === 62 || // >
      code === 95 || // _
      code === 96; // `
    if (separator) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleOf(content: string) {
  return parseContent(content).title || "Untitled";
}

export function previewOf(content: string) {
  const { body } = parseContent(content);
  return body
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^[#>*+\-\s]+/, "")
        .replace(/^\[[ x]\]\s/, ""),
    )
    .filter((l) => l && !l.startsWith("```"))
    .join(" ")
    .replace(/[*_`~]/g, "")
    .slice(0, 160);
}
