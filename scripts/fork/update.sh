#!/usr/bin/env bash
# Rebuilds this fork as "T3 Code (Nightly).app" and swaps it into /Applications.
#
#   scripts/fork/update.sh              build the current checkout, install, relaunch
#   scripts/fork/update.sh --sync       merge upstream/main first
#   scripts/fork/update.sh --no-install build only and print the .app path
#   scripts/fork/update.sh --install-only install the last build without rebuilding
#
# --sync exits 3 when upstream/main conflicts with this branch, after aborting the merge.
# Installing writes ~/.t3/fork.json, which tells the app to update itself from this checkout.
#
# Each install keeps the replaced app and a copy of the database in ~/.t3/fork-backup.
set -euo pipefail

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$repo"
export PATH="$repo/node_modules/.bin:$PATH"

sync=false
build=true
install=true
for arg in "$@"; do
  case $arg in
    --sync) sync=true ;;
    --no-install) install=false ;;
    --install-only) build=false ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if $sync; then
  git fetch upstream main
  if ! git merge --no-edit upstream/main; then
    if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
      git merge --abort
      echo "upstream/main conflicts with $(git branch --show-current); merge it by hand, then rerun without --sync" >&2
      exit 3
    fi
    exit 1
  fi
fi

out="$repo/release/fork"
if $build; then
  pnpm install --frozen-lockfile --yes

  # A -nightly.<date>.<n> version names the app "T3 Code (Nightly)", so it replaces the official
  # nightly in place. Local builds carry no update feed, so the app never updates itself away.
  base=$(node -p 'const [a, b, c] = require("./apps/desktop/package.json").version.split(/[.-]/); `${a}.${b}.${Number(c) + 1}`')
  version="$base-nightly.$(date +%Y%m%d).$(git rev-list --count HEAD)"
  arch=$([ "$(uname -m)" = arm64 ] && echo arm64 || echo x64)
  rm -rf "$out"
  # `dir` skips the DMG and zip, the slowest packaging steps.
  node scripts/build-desktop-artifact.ts --platform mac --target dir --arch "$arch" \
    --build-version "$version" --output-dir "$out"
fi

app=$(find "$out" -maxdepth 3 -name '*.app' -type d | head -1)
name="T3 Code (Nightly)"
if [ "$(basename "$app")" != "$name.app" ]; then
  echo "expected $name.app, built: ${app:-nothing}" >&2
  exit 1
fi
echo "Built: $app"
$install || exit 0

node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ repo: process.argv[2], branch: process.argv[3] }) + "\n")' \
  "$HOME/.t3/fork.json" "$repo" "$(git branch --show-current)"

log="$HOME/.t3/fork-install.log"
# Own session: quitting T3 Code closes its terminals, which would kill a child install.
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' /bin/bash -c '
  set -eu
  app=$1 name=$2
  dest="/Applications/$name.app"
  backup="$HOME/.t3/fork-backup"
  running() { [ "$(osascript -e "application \"$name\" is running")" = true ]; }
  if running; then osascript -e "quit app \"$name\""; fi
  # Waits through any quit confirmation T3 Code shows.
  while running; do sleep 1; done
  stamp=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$backup/db-$stamp"
  cp -f "$HOME"/.t3/userdata/statev2.sqlite* "$backup/db-$stamp"/ 2>/dev/null || true
  if [ -d "$dest" ]; then mv "$dest" "$backup/previous-$stamp.app"; fi
  ditto "$app" "$dest"
  open "$dest"
  echo "installed $(date)"
' _ "$app" "$name" >"$log" 2>&1 </dev/null &
echo "Installing: $name will quit and reopen. Log: $log"
