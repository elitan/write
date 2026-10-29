import { describe, expect, it } from "vitest";
import { shortTime } from "./format";
import { fuzzyFilter, fuzzyMatch } from "./fuzzy";
import {
  buildContent,
  countWords,
  parseContent,
  previewOf,
  slugify,
} from "./markdown";

describe("markdown", () => {
  it("splits the first H1 from the body", () => {
    expect(parseContent("# Hello\nworld")).toEqual({
      title: "Hello",
      body: "world",
      titleLine: 0,
    });
    expect(parseContent("intro\n# T\nrest")).toEqual({
      title: "T",
      body: "intro\nrest",
      titleLine: 1,
    });
    expect(parseContent("no title")).toEqual({
      title: "",
      body: "no title",
      titleLine: -1,
    });
  });

  it("round-trips title and body", () => {
    const content = buildContent("Plan", "\n- one\n- two");
    expect(parseContent(content)).toMatchObject({
      title: "Plan",
      body: "\n- one\n- two",
    });
  });

  it("counts words, ignoring markdown punctuation", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("- [ ] buy **oat** milk")).toBe(3);
    expect(countWords("- [x] ")).toBe(0);
    expect(countWords("## Heading\n\nTwo words")).toBe(3);
  });

  it("slugifies like the backend", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("Café 日本")).toBe("café-日本");
  });

  it("builds a plain-text preview", () => {
    expect(previewOf("# T\n\n- [x] **done** item\n```\ncode")).toBe(
      "done item code",
    );
  });
});

describe("fuzzy", () => {
  it("prefers contiguous matches", () => {
    const ranked = fuzzyFilter(
      "note",
      ["Not every tool", "New note", "Notebook"],
      (s) => s,
    );
    expect(ranked[0].item).toBe("Notebook");
    expect(ranked.map((r) => r.item)).toContain("New note");
  });

  it("matches word-start acronyms", () => {
    expect(fuzzyMatch("nn", "New note")?.indices).toEqual([0, 4]);
  });

  it("rejects scattered mid-word matches", () => {
    expect(fuzzyMatch("oat", "Go back")).toBeNull();
    expect(fuzzyMatch("xyz", "anything")).toBeNull();
  });
});

describe("format", () => {
  it("formats compact relative times", () => {
    const now = new Date("2026-06-15T12:00:00").getTime();
    expect(shortTime(now - 10_000, now)).toBe("now");
    expect(shortTime(now - 5 * 60_000, now)).toBe("5m");
    expect(shortTime(now - 3 * 3_600_000, now)).toBe("3h");
    expect(shortTime(new Date("2021-01-01").getTime(), now)).toBe("2021");
  });
});
