import { ActionPanel, Action, List, Color, closeMainWindow } from "@raycast/api";
import { readdirSync, statSync, writeFileSync } from "fs";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const WORKTREES_DIR = join(homedir(), "Developer", "worktrees");
const WEZTERM_REQUEST_FILE = "/tmp/wezterm-request.json";

interface GitStats {
  added: number;
  removed: number;
}

function getGitStats(dir: string): GitStats | null {
  try {
    const output = execSync("git diff --numstat HEAD 2>/dev/null", { cwd: dir }).toString();
    let added = 0;
    let removed = 0;
    for (const line of output.trim().split("\n")) {
      if (!line) continue;
      const [a, r] = line.split("\t");
      if (a !== "-") added += parseInt(a, 10);
      if (r !== "-") removed += parseInt(r, 10);
    }
    return { added, removed };
  } catch {
    return null;
  }
}

interface Worktree {
  name: string;
  path: string;
  parent: string;
  stats: GitStats | null;
}

function getWorktrees(): Worktree[] {
  if (!existsSync(WORKTREES_DIR)) return [];

  const worktrees: Worktree[] = [];
  for (const parent of readdirSync(WORKTREES_DIR)) {
    const parentPath = join(WORKTREES_DIR, parent);
    if (!statSync(parentPath).isDirectory()) continue;
    for (const child of readdirSync(parentPath)) {
      const childPath = join(parentPath, child);
      if (statSync(childPath).isDirectory()) {
        worktrees.push({ name: child, path: childPath, parent, stats: getGitStats(childPath) });
      }
    }
  }
  return worktrees;
}

export default function Command() {
  const worktrees = getWorktrees();

  return (
    <List searchBarPlaceholder="Search worktrees...">
      {worktrees.length === 0 ? (
        <List.EmptyView title="No worktrees found" description={WORKTREES_DIR} />
      ) : (
        worktrees.map((wt) => (
          <List.Item
            key={wt.path}
            title={wt.name}
            subtitle={wt.parent}
            accessories={
              wt.stats
                ? [
                    {
                      text: {
                        value: `+${wt.stats.added}`,
                        color: wt.stats.added || wt.stats.removed ? Color.Green : Color.SecondaryText,
                      },
                    },
                    {
                      text: {
                        value: `-${wt.stats.removed}`,
                        color: wt.stats.added || wt.stats.removed ? Color.Red : Color.SecondaryText,
                      },
                    },
                  ]
                : []
            }
            actions={
              <ActionPanel>
                <Action
                  title="Switch Workspace"
                  onAction={async () => {
                    writeFileSync(
                      WEZTERM_REQUEST_FILE,
                      JSON.stringify({
                        ops: [{ op: "switch_workspace_by_cwd", cwd: wt.path }],
                      }),
                    );
                    execSync("open -a WezTerm");
                    await closeMainWindow();
                  }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
