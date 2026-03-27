import { ActionPanel, Action, List, useNavigation, showToast, Toast, closeMainWindow } from "@raycast/api";
import { readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { useState } from "react";

const WORKSPACES_DIR = join(homedir(), "Developer", "workspaces");

function isGitWorktree(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

function CreateFolderList({ workspace }: { workspace: string }) {
  const { pop } = useNavigation();
  const workspacePath = join(WORKSPACES_DIR, workspace);
  const [searchText, setSearchText] = useState("");

  return (
    <List searchBarPlaceholder="Type folder name..." onSearchTextChange={setSearchText}>
      {searchText.length > 0 ? (
        <List.Item
          title={`Create "${searchText}"`}
          subtitle={join(workspacePath, searchText)}
          actions={
            <ActionPanel>
              <Action
                title="Create Folder"
                onAction={async () => {
                  const folderPath = join(workspacePath, searchText);
                  if (existsSync(folderPath)) {
                    await showToast({ style: Toast.Style.Failure, title: "Folder already exists" });
                    return;
                  }
                  mkdirSync(folderPath, { recursive: true });
                  await showToast({ style: Toast.Style.Success, title: `Created ${searchText}` });
                  await closeMainWindow();
                }}
              />
            </ActionPanel>
          }
        />
      ) : (
        <List.EmptyView title="Type a folder name" />
      )}
    </List>
  );
}

export default function Command() {
  if (!existsSync(WORKSPACES_DIR)) {
    return (
      <List>
        <List.EmptyView title="Workspaces directory not found" description={WORKSPACES_DIR} />
      </List>
    );
  }

  const workspaces = readdirSync(WORKSPACES_DIR).filter((name) => {
    const fullPath = join(WORKSPACES_DIR, name);
    return statSync(fullPath).isDirectory() && isGitWorktree(fullPath);
  });

  return (
    <List searchBarPlaceholder="Search workspaces...">
      {workspaces.length === 0 ? (
        <List.EmptyView title="No git workspaces found" description={WORKSPACES_DIR} />
      ) : (
        workspaces.map((ws) => (
          <List.Item
            key={ws}
            title={ws}
            actions={
              <ActionPanel>
                <Action.Push title="Create Folder" target={<CreateFolderList workspace={ws} />} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
