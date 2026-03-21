import { ActionPanel, Action, List, Color, Icon, closeMainWindow } from "@raycast/api";
import { execSync } from "child_process";
import { readdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const STATE_DIR = "/tmp/claude-instances";

interface ClaudeInstance {
  session_id: string;
  status?: string;
  cwd?: string;
  model?: string;
  lines_added?: number;
  lines_removed?: number;
  context_percent?: number;
  pid?: number;
  updated_at?: string;
}

function statusIcon(status?: string): { source: Icon; tintColor: Color } {
  switch (status) {
    case "working":
      return { source: Icon.CircleFilled, tintColor: Color.Green };
    case "waiting":
      return { source: Icon.CircleFilled, tintColor: Color.Orange };
    case "idle":
      return { source: Icon.CircleFilled, tintColor: Color.SecondaryText };
    default:
      return { source: Icon.QuestionMarkCircle, tintColor: Color.SecondaryText };
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

function loadInstances(): ClaudeInstance[] {
  try {
    const files = readdirSync(STATE_DIR).filter((f) => f.endsWith(".json"));
    return files
      .map((file) => {
        try {
          const content = readFileSync(join(STATE_DIR, file), "utf-8");
          const instance = JSON.parse(content) as ClaudeInstance;
          if (!isProcessAlive(instance.pid)) {
            try { unlinkSync(join(STATE_DIR, file)); } catch { /* ignore */ }
            return null;
          }
          return instance;
        } catch {
          return null;
        }
      })
      .filter((instance): instance is ClaudeInstance => instance !== null)
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
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
        <List.EmptyView title="No Claude instances running" description="Start a Claude Code session to see it here" />
      ) : (
        instances.map((instance) => {
          const added = instance.lines_added ?? 0;
          const removed = instance.lines_removed ?? 0;
          const hasLines = added > 0 || removed > 0;
          const contextPct = instance.context_percent ?? 0;

          return (
            <List.Item
              key={instance.session_id}
              title={projectName(instance.cwd)}
              subtitle={instance.cwd}
              icon={statusIcon(instance.status)}
              accessories={[
                ...(instance.model ? [{ tag: instance.model }] : []),
                ...(hasLines
                  ? [
                      { text: { value: `+${added}`, color: Color.Green } },
                      { text: { value: `-${removed}`, color: Color.Red } },
                    ]
                  : []),
                { text: `${contextPct}%`, tooltip: "Context usage" },
                { text: instance.status ?? "unknown" },
                { text: timeAgo(instance.updated_at), tooltip: instance.updated_at },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Open in Zed"
                    icon={Icon.Code}
                    onAction={() => { closeMainWindow(); execSync(`zed "${instance.cwd}"`); }}
                  />
                  <Action.CopyToClipboard title="Copy Working Directory" content={instance.cwd ?? ""} />
                  <Action.CopyToClipboard title="Copy Session ID" content={instance.session_id} />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
