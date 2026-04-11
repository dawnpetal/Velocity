#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

info()    { echo -e "  ${CYAN}→${RESET}  $*"; }
success() { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "  ${YELLOW}!${RESET}  $*"; }
die()     { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }
ask()     { echo -n "  $1 "; read -r "$2"; }

header "Velocity — Publish"

command -v git &>/dev/null || die "git not found."
command -v gh  &>/dev/null || die "gh not found — https://cli.github.com"

if ! gh auth status &>/dev/null 2>&1; then
  warn "Not authenticated — starting login..."
  gh auth login
fi

GH_USER=$(gh api user --jq '.login')
GH_ID=$(gh api user --jq '.id')
REPO_FULL="${GH_USER}/Velocity"
NOREPLY="${GH_ID}+${GH_USER}@users.noreply.github.com"

success "Authenticated as ${GH_USER}"
info    "Using noreply email"

header "Details"
ask "Commit message:" COMMIT_MSG
ask "Display name on commits (leave blank for ${GH_USER}):" GIT_NAME

[ -z "$COMMIT_MSG" ] && COMMIT_MSG="update"
[ -z "$GIT_NAME"  ] && GIT_NAME="$GH_USER"

header "Repository"

if gh repo view "$REPO_FULL" &>/dev/null 2>&1; then
  warn "Repository already exists."
  ask "Reset remote history and push fresh state? (y/n):" CONFIRM
  if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    info "Recreating repository..."
    gh repo delete "$REPO_FULL" --yes
    gh repo create "Velocity" --public
    success "Repository recreated"
  else
    info "Continuing with existing repository (force push)"
  fi
else
  gh repo create "Velocity" --public
  success "Repository created"
fi

header "Preparing commit"

rm -rf .git
git init -q
git config user.name  "$GIT_NAME"
git config user.email "$NOREPLY"

git add .
git commit -q -m "$COMMIT_MSG"
git branch -M main
git remote add origin "https://github.com/${REPO_FULL}.git"

header "Publishing"

git push -u origin main --force -q
success "https://github.com/${REPO_FULL}"

echo ""