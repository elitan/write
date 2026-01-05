import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "./use-settings";

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("returns default settings when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.vimMode).toBe(false);
  });

  it("loads settings from localStorage", () => {
    localStorage.setItem("write-settings", JSON.stringify({ vimMode: true }));
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.vimMode).toBe(true);
  });

  it("updates setting and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setSetting("vimMode", true);
    });

    expect(result.current.settings.vimMode).toBe(true);
    expect(
      JSON.parse(localStorage.getItem("write-settings") || "{}").vimMode,
    ).toBe(true);
  });

  it("handles invalid JSON in localStorage gracefully", () => {
    localStorage.setItem("write-settings", "invalid json");
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.vimMode).toBe(false);
  });

  it("merges partial settings with defaults", () => {
    localStorage.setItem("write-settings", JSON.stringify({}));
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.vimMode).toBe(false);
  });
});
