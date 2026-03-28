import { describe, it, expect } from "vitest";
import {
  parseGitNumstat,
  projectName,
  timeAgo,
  statusCategory,
  modeCategory,
  terminalTagValue,
  mergeHookAndMetrics,
  deduplicateByPid,
  resolveDisplayName,
} from "./lib";

describe("parseGitNumstat", () => {
  it("parses multiple files", () => {
    const output = "10\t2\tsrc/index.tsx\n5\t3\tsrc/lib.ts\n";
    expect(parseGitNumstat(output)).toEqual({ added: 15, removed: 5 });
  });

  it("returns zeros for empty output", () => {
    expect(parseGitNumstat("")).toEqual({ added: 0, removed: 0 });
  });

  it("handles binary files (dashes)", () => {
    const output = "-\t-\timage.png\n3\t1\tsrc/index.ts\n";
    expect(parseGitNumstat(output)).toEqual({ added: 3, removed: 1 });
  });

  it("handles single file", () => {
    expect(parseGitNumstat("42\t0\tREADME.md\n")).toEqual({ added: 42, removed: 0 });
  });
});

describe("projectName", () => {
  it("returns last path component", () => {
    expect(projectName("/Users/jed/Developer/my-project")).toBe("my-project");
  });

  it("returns 'unknown' for undefined", () => {
    expect(projectName(undefined)).toBe("unknown");
  });

  it("returns 'unknown' for empty string", () => {
    expect(projectName("")).toBe("unknown");
  });

  it("handles single component path", () => {
    expect(projectName("project")).toBe("project");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-03-28T12:00:00Z").getTime();

  it("returns empty string for undefined", () => {
    expect(timeAgo(undefined, now)).toBe("");
  });

  it("returns seconds ago", () => {
    expect(timeAgo("2026-03-28T11:59:30Z", now)).toBe("30s ago");
  });

  it("returns minutes ago", () => {
    expect(timeAgo("2026-03-28T11:55:00Z", now)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    expect(timeAgo("2026-03-28T10:00:00Z", now)).toBe("2h ago");
  });

  it("returns 0s ago for same time", () => {
    expect(timeAgo("2026-03-28T12:00:00Z", now)).toBe("0s ago");
  });
});

describe("statusCategory", () => {
  it("maps working", () => {
    expect(statusCategory("working")).toBe("working");
  });

  it("maps permission", () => {
    expect(statusCategory("permission")).toBe("permission");
  });

  it("maps stopped", () => {
    expect(statusCategory("stopped")).toBe("stopped");
  });

  it("maps undefined to unknown", () => {
    expect(statusCategory(undefined)).toBe("unknown");
  });

  it("maps unknown string to unknown", () => {
    expect(statusCategory("something-else")).toBe("unknown");
  });
});

describe("modeCategory", () => {
  it("maps acceptEdits", () => {
    expect(modeCategory("acceptEdits")).toBe("acceptEdits");
  });

  it("maps plan", () => {
    expect(modeCategory("plan")).toBe("plan");
  });

  it("maps dontAsk to dangerous", () => {
    expect(modeCategory("dontAsk")).toBe("dangerous");
  });

  it("maps bypassPermissions to dangerous", () => {
    expect(modeCategory("bypassPermissions")).toBe("dangerous");
  });

  it("maps undefined to default", () => {
    expect(modeCategory(undefined)).toBe("default");
  });

  it("maps default string to default", () => {
    expect(modeCategory("default")).toBe("default");
  });
});

describe("terminalTagValue", () => {
  it("returns wez for WezTerm", () => {
    expect(terminalTagValue("WezTerm")).toEqual({ value: "wez" });
  });

  it("returns zed for zed", () => {
    expect(terminalTagValue("zed")).toEqual({ value: "zed" });
  });

  it("is case-insensitive", () => {
    expect(terminalTagValue("WEZTERM")).toEqual({ value: "wez" });
  });

  it("returns the terminal name for unknown terminals", () => {
    expect(terminalTagValue("iTerm2")).toEqual({ value: "iTerm2" });
  });

  it("returns null for undefined", () => {
    expect(terminalTagValue(undefined)).toBeNull();
  });
});

describe("mergeHookAndMetrics", () => {
  it("merges metrics into hook data", () => {
    const hook = { session_id: "abc", status: "working", permission_mode: "plan" };
    const metrics = { cwd: "/tmp/project", model: "opus", context_percent: 50 };
    const result = mergeHookAndMetrics(hook, metrics);
    expect(result.cwd).toBe("/tmp/project");
    expect(result.model).toBe("opus");
    expect(result.context_percent).toBe(50);
  });

  it("hook-owned fields take priority over metrics", () => {
    const hook = {
      session_id: "abc",
      status: "working",
      permission_mode: "plan",
      auto_name: "my task",
      custom_name: "custom",
    };
    const metrics = {
      status: "stopped",
      permission_mode: "default",
      auto_name: "overwritten",
      custom_name: "overwritten",
    };
    const result = mergeHookAndMetrics(hook, metrics);
    expect(result.status).toBe("working");
    expect(result.permission_mode).toBe("plan");
    expect(result.auto_name).toBe("my task");
    expect(result.custom_name).toBe("custom");
  });

  it("preserves hook fields when metrics is empty", () => {
    const hook = { session_id: "abc", status: "stopped" };
    const result = mergeHookAndMetrics(hook, {});
    expect(result.session_id).toBe("abc");
    expect(result.status).toBe("stopped");
  });
});

describe("deduplicateByPid", () => {
  it("keeps first instance per PID", () => {
    const instances = [
      { pid: 100, name: "first" },
      { pid: 100, name: "second" },
      { pid: 200, name: "third" },
    ];
    const result = deduplicateByPid(instances);
    expect(result).toEqual([
      { pid: 100, name: "first" },
      { pid: 200, name: "third" },
    ]);
  });

  it("keeps instances without a PID", () => {
    const instances = [
      { pid: undefined, name: "no-pid-1" },
      { pid: undefined, name: "no-pid-2" },
      { pid: 100, name: "has-pid" },
    ];
    const result = deduplicateByPid(instances);
    expect(result).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateByPid([])).toEqual([]);
  });
});

describe("resolveDisplayName", () => {
  it("prefers custom_name", () => {
    expect(
      resolveDisplayName({
        custom_name: "custom",
        wezterm_tab_title: "tab",
        auto_name: "auto",
        cwd: "/tmp/project",
      }),
    ).toBe("custom");
  });

  it("falls back to wezterm_tab_title", () => {
    expect(
      resolveDisplayName({
        wezterm_tab_title: "tab",
        auto_name: "auto",
        cwd: "/tmp/project",
      }),
    ).toBe("tab");
  });

  it("falls back to auto_name", () => {
    expect(
      resolveDisplayName({
        auto_name: "auto",
        cwd: "/tmp/project",
      }),
    ).toBe("auto");
  });

  it("falls back to project name from cwd", () => {
    expect(resolveDisplayName({ cwd: "/tmp/project" })).toBe("project");
  });

  it("returns 'unknown' when nothing is set", () => {
    expect(resolveDisplayName({})).toBe("unknown");
  });
});
