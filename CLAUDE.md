# Raycast Claude Tracker

A Raycast extension that lists and manages active Claude Code instances running on the system. It reads session state from `/tmp/claude-instances` and displays project info, model, line changes, context usage, and status.

## Commands

- `npm run dev` — local development (`ray develop`)
- `npm run build` — production build (`ray build`)
- `npm run lint` — lint (`ray lint`)
- `npm run fix-lint` — auto-fix lint issues (`ray lint --fix`)

## Architecture

Single-file extension: all logic lives in `src/index.tsx`. Uses Raycast's `List` component to display Claude Code sessions with status icons, line change stats, and context percentage.

State is read from JSON files in `/tmp/claude-instances`. Stale state files (dead processes) are automatically cleaned up.

## Stack

- TypeScript (strict mode, ES2022 target)
- React JSX (react-jsx transform)
- Raycast API (`@raycast/api`, `@raycast/utils`)
