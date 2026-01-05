import { describe, expect, it } from "vitest";
import { buildContent, parseContent } from "./editor";

describe("parseContent", () => {
  it("extracts title from markdown h1", () => {
    const result = parseContent("# Hello World\nBody text");
    expect(result.title).toBe("Hello World");
    expect(result.body).toBe("Body text");
  });

  it("handles content before h1", () => {
    const result = parseContent("Some intro\n# Title\nBody");
    expect(result.title).toBe("Title");
    expect(result.body).toBe("Some intro\nBody");
  });

  it("returns empty title when no h1", () => {
    const result = parseContent("No heading here");
    expect(result.title).toBe("");
    expect(result.body).toBe("No heading here");
  });

  it("handles empty content", () => {
    const result = parseContent("");
    expect(result.title).toBe("");
    expect(result.body).toBe("");
  });

  it("only matches h1, not h2", () => {
    const result = parseContent("## Not a title\nBody");
    expect(result.title).toBe("");
    expect(result.body).toBe("## Not a title\nBody");
  });

  it("handles multiple h1s (takes first)", () => {
    const result = parseContent("# First\n# Second\nBody");
    expect(result.title).toBe("First");
    expect(result.body).toBe("# Second\nBody");
  });
});

describe("buildContent", () => {
  it("creates markdown with h1 title", () => {
    const result = buildContent("My Title", "Body text");
    expect(result).toBe("# My Title\nBody text");
  });

  it("handles empty title", () => {
    const result = buildContent("", "Body only");
    expect(result).toBe("# \nBody only");
  });

  it("handles empty body", () => {
    const result = buildContent("Title", "");
    expect(result).toBe("# Title\n");
  });
});
