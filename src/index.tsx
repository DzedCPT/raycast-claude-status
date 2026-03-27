import {
  ActionPanel,
  Action,
  List,
  Color,
  Icon,
  closeMainWindow,
} from "@raycast/api";
import { execSync } from "child_process";
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

// State files are written by two scripts in ~/.claude/:
//   - statusline.sh: writes cwd, model, lines, context_percent, pid, updated_at
//   - hooks/raycast-status.sh: writes status, permission_mode, auto_name, custom_name
// Each session gets its own JSON file: /tmp/claude-instances/<session_id>.json
const STATE_DIR = "/tmp/claude-instances";
const WEZTERM = "/opt/homebrew/bin/wezterm";

const WEZTERM_REQUEST_FILE = "/tmp/wezterm-request.json";

function sendWeztermRequest(ops: Record<string, unknown>[]) {
  writeFileSync(WEZTERM_REQUEST_FILE, JSON.stringify({ ops }));
}

interface ClaudeInstance {
  session_id: string;
  status?: string; // "working" | "stopped" | "permission"
  cwd?: string;
  model?: string;
  lines_added?: number;
  lines_removed?: number;
  context_percent?: number;
  pid?: number; // Claude node process PID, used for stale session detection
  permission_mode?: string; // "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions"
  auto_name?: string; // Latest user prompt (truncated), updated on each prompt
  custom_name?: string; // User-set name via "name: ..." prompt, takes priority over auto_name
  terminal?: string; // TERM_PROGRAM value: "WezTerm", "zed", etc.
  wezterm_pane?: number; // WEZTERM_PANE id, used to activate the correct pane
  wezterm_tab_title?: string; // Populated at load time from `wezterm cli list`
  updated_at?: string;
}

// Status dot: green = working, orange = needs permission, grey = stopped
function statusIcon(status?: string): { source: Icon; tintColor: Color } {
  switch (status) {
    case "working":
      return { source: Icon.CircleFilled, tintColor: Color.Green };
    case "permission":
      return { source: Icon.CircleFilled, tintColor: Color.Orange };
    case "stopped":
      return { source: Icon.CircleFilled, tintColor: Color.SecondaryText };
    default:
      return {
        source: Icon.QuestionMarkCircle,
        tintColor: Color.SecondaryText,
      };
  }
}

// Permission mode dot: grey = default, purple = accept edits, turquoise = plan, red = dangerous
function modeIcon(mode?: string): { source: Icon; tintColor: Color } {
  switch (mode) {
    case "acceptEdits":
      return { source: Icon.CircleFilled, tintColor: Color.Purple };
    case "plan":
      return {
        source: Icon.CircleFilled,
        tintColor: { light: "#0d9488", dark: "#2dd4bf" },
      };
    case "dontAsk":
    case "bypassPermissions":
      return { source: Icon.CircleFilled, tintColor: Color.Red };
    default:
      return { source: Icon.CircleFilled, tintColor: Color.SecondaryText };
  }
}

function terminalTag(
  terminal?: string,
): { value: string; color: Color } | null {
  if (!terminal) return null;
  switch (terminal.toLowerCase()) {
    case "wezterm":
      return { value: "wez", color: Color.Blue };
    case "zed":
      return { value: "zed", color: Color.Yellow };
    default:
      return { value: terminal, color: Color.SecondaryText };
  }
}

// When a terminal is closed abruptly, Claude Code's SessionEnd hook never fires,
// leaving stale state files behind. We detect this by storing the Claude process
// PID (written by the statusline hook as $PPID) and checking if it's still alive.
//
// We use process.kill(pid, 0) — signal 0 doesn't kill anything, it just checks
// whether the process exists. This is a pure Node.js call that works reliably
// inside Raycast's sandbox, unlike shell-based approaches (lsof, ps) which can
// fail due to Raycast's restricted execution environment.
function isProcessAlive(pid?: number): boolean {
  if (!pid) return true; // no pid yet (pre-update state file), keep it
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getWeztermPanes(): Map<number, { tab_title: string }> {
  try {
    const json = execSync(`${WEZTERM} cli list --format json`).toString();
    const panes = JSON.parse(json) as { pane_id: number; tab_title: string }[];
    const map = new Map<number, { tab_title: string }>();
    for (const p of panes) {
      map.set(p.pane_id, { tab_title: p.tab_title });
    }
    return map;
  } catch {
    return new Map();
  }
}

function loadInstances(): ClaudeInstance[] {
  try {
    // State is split across two files per session to avoid a race condition:
    //   <id>.json         — written by the hook script (owns status, permission_mode, names)
    //   <id>.metrics.json — written by the statusline script (owns cwd, model, lines, context%, pid)
    //
    // Both scripts run concurrently. If they shared a single file, the statusline's
    // frequent read-modify-write cycle could overwrite a status change the hook just made.
    // With separate files, each script writes its own file atomically (jq … > tmp && mv),
    // and we merge them here at read time where it's single-threaded and safe.
    const files = readdirSync(STATE_DIR).filter(
      (f) => f.endsWith(".json") && !f.endsWith(".metrics.json"),
    );
    const instances = files
      .map((file) => {
        try {
          const content = readFileSync(join(STATE_DIR, file), "utf-8");
          if (!content.trim()) return null;
          const hook = JSON.parse(content) as ClaudeInstance;

          // Merge metrics file if it exists
          const metricsFile = file.replace(".json", ".metrics.json");
          try {
            const metricsContent = readFileSync(
              join(STATE_DIR, metricsFile),
              "utf-8",
            );
            if (metricsContent.trim()) {
              const metrics = JSON.parse(
                metricsContent,
              ) as Partial<ClaudeInstance>;
              Object.assign(hook, metrics, {
                // Hook-owned fields always win
                status: hook.status,
                permission_mode: hook.permission_mode,
                auto_name: hook.auto_name,
                custom_name: hook.custom_name,
              });
            }
          } catch {
            /* no metrics yet */
          }

          if (!isProcessAlive(hook.pid)) {
            try {
              unlinkSync(join(STATE_DIR, file));
              unlinkSync(join(STATE_DIR, metricsFile));
            } catch {
              /* ignore */
            }
            return null;
          }
          return hook;
        } catch {
          return null;
        }
      })
      .filter((instance): instance is ClaudeInstance => instance !== null)
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));

    // Deduplicate by PID — keep only the most recent session per process.
    // This handles the case where a new session reuses the same Claude process
    // (same PID + pane) but the old state file was never cleaned up.
    const seenPids = new Set<number>();
    const deduped = instances.filter((instance) => {
      if (!instance.pid) return true;
      if (seenPids.has(instance.pid)) return false;
      seenPids.add(instance.pid);
      return true;
    });

    // Enrich WezTerm instances with tab titles
    const hasWezterm = deduped.some(
      (i) => i.terminal?.toLowerCase() === "wezterm" && i.wezterm_pane != null,
    );
    if (hasWezterm) {
      const panes = getWeztermPanes();
      for (const instance of deduped) {
        if (instance.wezterm_pane != null) {
          const pane = panes.get(instance.wezterm_pane);
          if (pane?.tab_title) {
            instance.wezterm_tab_title = pane.tab_title;
          }
        }
      }
    }

    return deduped;
  } catch {
    return [];
  }
}

function projectName(cwd?: string): string {
  if (!cwd) return "unknown";
  return cwd.split("/").pop() || cwd;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function Command() {
  const instances = loadInstances();

  return (
    <List>
      {instances.length === 0 ? (
        <List.EmptyView
          title="No Claude instances running"
          description="Start a Claude Code session to see it here"
        />
      ) : (
        instances.map((instance) => {
          const added = instance.lines_added ?? 0;
          const removed = instance.lines_removed ?? 0;
          const hasLines = added > 0 || removed > 0;
          const contextPct = instance.context_percent ?? 0;

          return (
            <List.Item
              key={instance.session_id}
              // Name priority: custom name > wezterm tab title > auto name > directory name
              title={
                instance.custom_name ||
                instance.wezterm_tab_title ||
                instance.auto_name ||
                projectName(instance.cwd)
              }
              subtitle={instance.cwd?.split("/").slice(-2).join("/")}
              icon={statusIcon(instance.status)}
              accessories={[
                ...(instance.model ? [{ tag: instance.model }] : []),
                {
                  text: {
                    value: `+${added}`,
                    color: hasLines ? Color.Green : Color.SecondaryText,
                  },
                },
                {
                  text: {
                    value: `-${removed}`,
                    color: hasLines ? Color.Red : Color.SecondaryText,
                  },
                },
                { text: `${contextPct}%`, tooltip: "Context usage" },
                { icon: modeIcon(instance.permission_mode) },
                {
                  text: timeAgo(instance.updated_at),
                  tooltip: instance.updated_at,
                },
              ]}
              actions={
                <ActionPanel>
                  {instance.terminal?.toLowerCase() === "wezterm" &&
                  instance.wezterm_pane != null ? (
                    <Action
                      title="Focus WezTerm Pane"
                      icon={Icon.Terminal}
                      onAction={() => {
                        closeMainWindow();
                        const listJson = execSync(
                          `${WEZTERM} cli list --format json`,
                        ).toString();
                        const panes = JSON.parse(listJson) as {
                          pane_id: number;
                          workspace: string;
                        }[];
                        const target = panes.find(
                          (p) => p.pane_id === instance.wezterm_pane,
                        );
                        if (target) {
                          sendWeztermRequest([
                            {
                              op: "focus_pane",
                              workspace: target.workspace,
                              pane_id: instance.wezterm_pane,
                            },
                          ]);
                        }
                        execSync(`open -a WezTerm`);
                      }}
                    />
                  ) : (
                    <Action
                      title="Open in Zed"
                      icon={Icon.Code}
                      onAction={() => {
                        closeMainWindow();
                        execSync(`zed "${instance.cwd}"`);
                      }}
                    />
                  )}
                  <Action.CopyToClipboard
                    title="Copy Working Directory"
                    content={instance.cwd ?? ""}
                  />
                  <Action.CopyToClipboard
                    title="Copy Session ID"
                    content={instance.session_id}
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
