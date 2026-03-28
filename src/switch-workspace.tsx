import { ActionPanel, Action, List, Icon, Color, closeMainWindow } from "@raycast/api";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { sortWorkspacesByRecency, Workspace } from "./lib";

const STATE_FILE = "/tmp/wezterm-state.json";
const WEZTERM_REQUEST_FILE = "/tmp/wezterm-request.json";

interface WeztermState {
  active_workspace: string;
  workspaces: Workspace[];
}

function loadState(): WeztermState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const content = readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(content) as WeztermState;
  } catch {
    return null;
  }
}

export default function Command() {
  const state = loadState();

  if (!state) {
    return (
      <List>
        <List.EmptyView title="No WezTerm state found" description={STATE_FILE} />
      </List>
    );
  }

  const sorted = sortWorkspacesByRecency(state.workspaces);

  return (
    <List searchBarPlaceholder="Search workspaces...">
      {sorted.map((ws) => (
        <List.Item
          key={ws.name}
          title={ws.name}
          subtitle={ws.cwd ?? undefined}
          accessories={
            ws.name === state.active_workspace
              ? [{ icon: { source: Icon.CircleFilled, tintColor: Color.Green }, tooltip: "Active" }]
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
                      ops: [{ op: "switch_workspace", workspace: ws.name }],
                    }),
                  );
                  execSync("open -a WezTerm");
                  await closeMainWindow();
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
