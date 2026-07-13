#!/usr/bin/env bash
# Idempotently symlink the per-user Claude memory directory to this repo's .claude/memory (ADR-003),
# so repo and local memory are literally the same files. Defensive: never destroys data.
set -euo pipefail

repo_dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source_dir="$repo_dir/.claude/memory"
config_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

if [ ! -d "$source_dir" ]; then
  echo "claude-memory: source missing: $source_dir" >&2
  exit 1
fi

# Encode the repo path the way Claude Code itself does it under ~/.claude/projects/.
#
# - Linux/macOS:   /home/x/foo/bar      → -home-x-foo-bar
# - MSYS (Windows): /e/foo/bar          → e--foo-bar   (drive letter, then "--" for the ":", then
#                                                       the rest with "/" replaced by "-")
#
# The previous version of this script only ran `s#/#-#g`, which produced `-e-foo-bar` on
# Windows — that path is NOT what Claude Code looks at, so the symlink ended up orphaned and
# the auto-memory layer couldn't find the repo memory. We fix that here.
case "$repo_dir" in
  /[a-zA-Z]/*)
    drive_letter="$(printf '%s' "$repo_dir" | cut -c2)"
    rest="${repo_dir:2}"  # keeps the leading slash of the rest, which becomes the second "-"
    encoded="$drive_letter-$(printf '%s' "$rest" | sed 's#/#-#g')"
    ;;
  *)
    encoded="$(printf '%s' "$repo_dir" | sed 's#/#-#g')"
    ;;
esac
target_parent="$config_dir/projects/$encoded"
target="$target_parent/memory"

mkdir -p "$target_parent"

# Already linked correctly -> nothing to do.
if [ -L "$target" ] && [ "$(readlink "$target")" = "$source_dir" ]; then
  echo "claude-memory: symlink already in place ($target)."
  exit 0
fi

# Back up an existing real directory/file before replacing it. Never destroy.
if [ -e "$target" ] && [ ! -L "$target" ]; then
  bak="$target.bak-$(date +%Y%m%d%H%M%S)"
  mv "$target" "$bak"
  echo "claude-memory: backed up existing memory to $bak"
fi

# Remove a stale/incorrect symlink, then create the correct one.
[ -L "$target" ] && rm -f "$target"
ln -s "$source_dir" "$target"
echo "claude-memory: linked $target -> $source_dir"
