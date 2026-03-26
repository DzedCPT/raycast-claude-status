#!/bin/bash
# Install Del2 hooks into Claude Code configuration.
# Symlinks the hook scripts and patches ~/.claude/settings.json.
# Idempotent — safe to re-run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS="$CLAUDE_DIR/settings.json"

# Ensure directories exist
mkdir -p "$HOOKS_DIR"

# --- Symlink hook scripts ---

link_file() {
    local src="$1" dst="$2"
    if [[ -L "$dst" ]]; then
        local current
        current=$(readlink "$dst")
        if [[ "$current" == "$src" ]]; then
            echo "  ✓ $dst (already linked)"
            return
        fi
        echo "  → $dst (updating symlink)"
        ln -sf "$src" "$dst"
    elif [[ -e "$dst" ]]; then
        echo "  ⚠ $dst exists and is not a symlink — backing up to ${dst}.bak"
        mv "$dst" "${dst}.bak"
        ln -s "$src" "$dst"
    else
        echo "  → $dst"
        ln -s "$src" "$dst"
    fi
}

echo "Linking hooks..."
link_file "$SCRIPT_DIR/hooks/statusline.sh" "$CLAUDE_DIR/statusline.sh"
link_file "$SCRIPT_DIR/hooks/raycast-status.sh" "$HOOKS_DIR/raycast-status.sh"

# Make executable
chmod +x "$SCRIPT_DIR/hooks/statusline.sh" "$SCRIPT_DIR/hooks/raycast-status.sh"

# --- Patch settings.json ---

HOOK_CMD="~/.claude/hooks/raycast-status.sh"
STATUSLINE_CMD="~/.claude/statusline.sh"

# The hook entry that needs to exist in each hook event array
HOOK_ENTRY='{"type": "command", "command": "'"$HOOK_CMD"'"}'

# All hook events that raycast-status.sh handles
HOOK_EVENTS=(PreToolUse PostToolUse SessionStart UserPromptSubmit Stop SubagentStop Notification SessionEnd)

if [[ ! -f "$SETTINGS" ]]; then
    echo "Creating $SETTINGS..."
    echo '{}' > "$SETTINGS"
fi

echo "Patching settings.json..."

# Build a jq expression that ensures our hook entry exists in each event
JQ_EXPR='.'
for event in "${HOOK_EVENTS[@]}"; do
    # Ensure .hooks.<event> is an array with at least one element containing our hook
    JQ_EXPR="$JQ_EXPR"'
    | .hooks.'"$event"' as $arr
    | if ($arr // [] | map(.hooks // [] | map(.command) | flatten) | flatten | any(. == "'"$HOOK_CMD"'"))
      then .
      else .hooks.'"$event"' = (($arr // []) + [{"hooks": ['"$HOOK_ENTRY"']}])
      end'
done

# Also ensure statusLine is configured
JQ_EXPR="$JQ_EXPR"'
    | if .statusLine.command == "'"$STATUSLINE_CMD"'"
      then .
      else .statusLine = {"type": "command", "command": "'"$STATUSLINE_CMD"'", "padding": 0}
      end'

jq "$JQ_EXPR" "$SETTINGS" > "${SETTINGS}.tmp" && mv "${SETTINGS}.tmp" "$SETTINGS"

echo "Done! Restart Claude Code sessions for changes to take effect."
