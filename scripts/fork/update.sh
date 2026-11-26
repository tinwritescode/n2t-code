#!/usr/bin/env bash
# Rebuilds this fork as "n2t Code.app" and swaps it into /Applications.
#
#   scripts/fork/update.sh              build the current checkout, install, relaunch
#   scripts/fork/update.sh --sync       merge upstream/main first
#   scripts/fork/update.sh --no-install build only and print the .app path
#   scripts/fork/update.sh --install-only install the last build without rebuilding
#
# --sync merges origin's copy of this branch, then upstream/main, and pushes the result to origin
# after a build. It exits 3 when either merge conflicts, after aborting it.
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

branch=$(git branch --show-current)

# The app reads these lines to show update progress.
progress() { echo "==> [$1%] $2"; }

# Merges a ref, or aborts and exits 3 when it conflicts.
merge() {
  if ! git merge --no-edit "$1"; then
    if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
      git merge --abort
      echo "$1 conflicts with $branch; merge it by hand, then rerun without --sync" >&2
      exit 3
    fi
    exit 1
  fi
}

if $sync; then
  # The fork's commits pushed from elsewhere first, then upstream's. No access to origin skips it.
  progress 5 "Merging origin/$branch"
  if git fetch origin "$branch"; then merge "origin/$branch"; fi
  progress 15 "Merging upstream/main"
  git fetch upstream main
  merge upstream/main
fi

out="$repo/release/fork"
if $build; then
  progress 25 "Installing dependencies"
  pnpm install --frozen-lockfile --yes

  # A -nightly.<date>.<n> version names the app "n2t Code". Local builds carry no update feed,
  # so the app never updates itself away.
  base=$(node -p 'const [a, b, c] = require("./apps/desktop/package.json").version.split(/[.-]/); `${a}.${b}.${Number(c) + 1}`')
  version="$base-nightly.$(date +%Y%m%d).$(git rev-list --count HEAD)"
  arch=$([ "$(uname -m)" = arm64 ] && echo arm64 || echo x64)
  rm -rf "$out"
  progress 45 "Building T3 Code"
  # `dir` skips the DMG and zip, the slowest packaging steps.
  node scripts/build-desktop-artifact.ts --platform mac --target dir --arch "$arch" \
    --build-version "$version" --output-dir "$out"
fi

app=$(find "$out" -maxdepth 3 -name '*.app' -type d | head -1)
name="n2t Code"
if [ "$(basename "$app")" != "$name.app" ]; then
  echo "expected $name.app, built: ${app:-nothing}" >&2
  exit 1
fi
echo "Built: $app"

if $sync && $build; then
  progress 95 "Pushing $branch to origin"
  git push origin "HEAD:$branch" || echo "could not push $branch to origin; push it by hand" >&2
fi
$install || exit 0

node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ repo: process.argv[2], branch: process.argv[3] }) + "\n")' \
  "$HOME/.t3/fork.json" "$repo" "$branch"

log="$HOME/.t3/fork-install.log"
# Own session: quitting T3 Code closes its terminals, which would kill a child install. The
# parent waits until the child has left this process group, because the app kills the group
# as soon as this script exits.
perl -MPOSIX -e 'pipe(my $r, my $w); if (fork) { close $w; <$r>; exit } close $r; POSIX::setsid(); close $w; exec @ARGV' /bin/bash -c '
  set -eu
  app=$1 name=$2
  # Builds before the rename installed as "T3 Code (Nightly)"; both apps share ~/.t3, so it quits too.
  legacy="T3 Code (Nightly)"
  dest="/Applications/$name.app"
  backup="$HOME/.t3/fork-backup"
  running() { [ "$(osascript -e "application \"$1\" is running")" = true ]; }
  for target in "$name" "$legacy"; do
    if running "$target"; then osascript -e "quit app \"$target\""; fi
    # Waits through any quit confirmation the app shows.
    while running "$target"; do sleep 1; done
  done
  stamp=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$backup/db-$stamp"
  cp -f "$HOME"/.t3/userdata/statev2.sqlite* "$backup/db-$stamp"/ 2>/dev/null || true
  if [ -d "$dest" ]; then mv "$dest" "$backup/previous-$stamp.app"; fi
  ditto "$app" "$dest"
  open "$dest"
  echo "installed $(date)"
' _ "$app" "$name" >"$log" 2>&1 </dev/null
echo "Installing: $name will quit and reopen. Log: $log"
