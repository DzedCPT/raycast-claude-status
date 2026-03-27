# Raycast Claude Status

A Raycast extension that lists and manages active Claude Code instances. Reads session state from `/tmp/claude-instances/` and displays project info, model, line changes, context usage, and status.

## Commands

- `npm run dev` — local development (`ray develop`)
- `npm run build` — production build (`ray build`)
- `npm run lint` — lint (`ray lint`)
- `npm run fix-lint` — auto-fix lint issues (`ray lint --fix`)

## Architecture

Single-file extension: all logic lives in `src/index.tsx`. Uses Raycast's `List` component to display Claude Code sessions with status icons, line change stats, and context percentage.

### State system

Session state lives in `/tmp/claude-instances/` as two files per session:

- `<session_id>.json` — written by the hook script (`hooks/raycast-status.sh`). Owns status, permission_mode, auto_name, custom_name, terminal, wezterm_pane.
- `<session_id>.metrics.json` — written by the statusline script (`hooks/statusline.sh`). Owns cwd, model, lines_added, lines_removed, context_percent, pid, updated_at.

The two-file split eliminates a race condition: the statusline's read-modify-write cycle could overwrite hook status changes. The Raycast extension merges both files at load time, with hook-owned fields taking priority.

### Hook scripts (in `hooks/`)

- **`raycast-status.sh`** — Claude Code hook (SessionStart, UserPromptSubmit, PreToolUse, Stop, Notification, SessionEnd). Updates status and permission_mode. Also handles session naming: `name: <value>` prompts are intercepted and blocked, setting a custom_name; otherwise the user's prompt (truncated to 25 chars) becomes the auto_name.
- **`statusline.sh`** — Claude Code statusline script. Writes metrics (model, cwd, lines, context %, pid) to the `.metrics.json` file. Maps AWS Bedrock ARNs to friendly model names.

### Stale session cleanup

- The extension checks if each session's PID is still alive via `process.kill(pid, 0)` (signal 0, no-kill check). Dead sessions are cleaned up on load.
- The hook script runs `find` to delete state files older than 24 hours.
- Sessions are deduplicated by PID (keeps most recent).

### Terminal integration

- WezTerm: focuses the correct pane via a request file (`/tmp/wezterm-request.json`) and `open -a WezTerm`.
- Zed: opens the project directory via `zed` CLI.
- Terminal type is detected from `$TERM_PROGRAM` env var and shown as a tag.

## Stack

- TypeScript (strict mode, ES2022 target)
- React JSX (react-jsx transform)
- Raycast API (`@raycast/api`, `@raycast/utils`)
- Shell scripts (bash, requires `jq`)
