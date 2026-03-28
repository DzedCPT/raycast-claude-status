// Pure logic extracted for testability. UI components import from here.

export interface GitStats {
  added: number;
  removed: number;
}

export function parseGitNumstat(output: string): GitStats {
  let added = 0;
  let removed = 0;
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const [a, r] = line.split("\t");
    if (a !== "-") added += parseInt(a, 10);
    if (r !== "-") removed += parseInt(r, 10);
  }
  return { added, removed };
}

export function projectName(cwd?: string): string {
  if (!cwd) return "unknown";
  return cwd.split("/").pop() || cwd;
}

export function timeAgo(dateStr?: string, now?: number): string {
  if (!dateStr) return "";
  const seconds = Math.floor(((now ?? Date.now()) - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export type StatusType = "working" | "permission" | "stopped" | string | undefined;

export function statusCategory(status?: string): "working" | "permission" | "stopped" | "unknown" {
  switch (status) {
    case "working":
      return "working";
    case "permission":
      return "permission";
    case "stopped":
      return "stopped";
    default:
      return "unknown";
  }
}

export function modeCategory(mode?: string): "acceptEdits" | "plan" | "dangerous" | "default" {
  switch (mode) {
    case "acceptEdits":
      return "acceptEdits";
    case "plan":
      return "plan";
    case "dontAsk":
    case "bypassPermissions":
      return "dangerous";
    default:
      return "default";
  }
}

export function terminalTagValue(terminal?: string): { value: string } | null {
  if (!terminal) return null;
  switch (terminal.toLowerCase()) {
    case "wezterm":
      return { value: "wez" };
    case "zed":
      return { value: "zed" };
    default:
      return { value: terminal };
  }
}

export interface MergeableInstance {
  session_id: string;
  status?: string;
  permission_mode?: string;
  auto_name?: string;
  custom_name?: string;
  pid?: number;
  updated_at?: string;
  [key: string]: unknown;
}

export function mergeHookAndMetrics(
  hook: MergeableInstance,
  metrics: Partial<MergeableInstance>,
): MergeableInstance {
  return {
    ...hook,
    ...metrics,
    // Hook-owned fields always win
    status: hook.status,
    permission_mode: hook.permission_mode,
    auto_name: hook.auto_name,
    custom_name: hook.custom_name,
  };
}

export function deduplicateByPid<T extends { pid?: number }>(instances: T[]): T[] {
  const seenPids = new Set<number>();
  return instances.filter((instance) => {
    if (!instance.pid) return true;
    if (seenPids.has(instance.pid)) return false;
    seenPids.add(instance.pid);
    return true;
  });
}

export interface Workspace {
  name: string;
  cwd: string | null;
  last_touched: number | null;
}

export function sortWorkspacesByRecency(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => (b.last_touched ?? 0) - (a.last_touched ?? 0));
}

export function resolveDisplayName(instance: {
  custom_name?: string;
  wezterm_tab_title?: string;
  auto_name?: string;
  cwd?: string;
}): string {
  return (
    instance.custom_name ||
    instance.wezterm_tab_title ||
    instance.auto_name ||
    projectName(instance.cwd)
  );
}
