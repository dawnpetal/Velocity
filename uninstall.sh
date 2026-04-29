#!/usr/bin/env bash
set -euo pipefail
RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
ok()      { echo -e "  ${GREEN}✓${RESET}  $*"; }
skip()    { echo -e "  ${DIM}–  $* (not found)${RESET}"; }
removed() { echo -e "  ${RED}✗${RESET}  removed: $*"; }
warn()    { echo -e "  ${YELLOW}!${RESET}  $*"; }
rule()    { echo -e "${DIM}────────────────────────────────────────────────────${RESET}"; }

step() {
  local num="$1" total="$2" label="$3"
  echo
  rule
  echo -e "  ${BOLD}[${num}/${total}] ${label}${RESET}"
  rule
}

size_of() {
  du -sh "$1" 2>/dev/null | cut -f1 || echo "unknown size"
}

ask() {
  local prompt="$1"
  if $NON_INTERACTIVE; then
    return 0
  fi
  local reply
  while true; do
    echo -en "  ${BOLD}?${RESET}  ${prompt} ${DIM}[y/n]${RESET} "
    read -r reply </dev/tty || { warn "Could not read input"; return 1; }
    case "$reply" in
      [Yy]|[Yy][Ee][Ss]) return 0 ;;
      [Nn]|[Nn][Oo])     return 1 ;;
      *) echo -e "  ${YELLOW}Please answer y or n.${RESET}" ;;
    esac
  done
}

HOME_DIR="$HOME"
CURRENT_USER="$(whoami)"
APP_BUNDLE="/Applications/VelocityUI.app"
VELOCITYUI_DATA="$HOME_DIR/VelocityUI"
TAURI_APP_SUPPORT="$HOME_DIR/Library/Application Support/com.velocityui.dev"
TAURI_CACHE="$HOME_DIR/Library/Caches/com.velocityui.dev"
TAURI_LOGS="$HOME_DIR/Library/Logs/com.velocityui.dev"
TAURI_SAVED_STATE="$HOME_DIR/Library/Saved Application State/com.velocityui.dev.savedState"
TAURI_WEBVIEW_CACHE="$HOME_DIR/Library/WebKit/com.velocityui.dev"

MODE=""
NON_INTERACTIVE=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --clean)           MODE="clean" ;;
    --full)            MODE="full" ;;
    --app)             MODE="app" ;;
    --non-interactive) NON_INTERACTIVE=true ;;
  esac
done

# When piped (curl | bash), stdin is not a TTY — use /dev/tty for input
if [ ! -t 0 ] && ! [ -e /dev/tty ]; then
  NON_INTERACTIVE=true
fi

clear
echo
echo -e "${BOLD}${CYAN}"
echo "  ╭──────────────────────────────────────────────╮"
echo "  │            VelocityUI Uninstaller              │"
echo "  ╰──────────────────────────────────────────────╯"
echo -e "${RESET}"
echo -e "  ${DIM}Cleanly remove VelocityUI from your Mac${RESET}"
echo
rule
MAC_VER="—"
if command -v sw_vers >/dev/null 2>&1; then
  MAC_VER="$(sw_vers -productVersion 2>/dev/null || echo '—')"
fi
echo -e "  Running as ${BOLD}$CURRENT_USER${RESET} on macOS $MAC_VER"
echo
echo -e "  ${GREEN}This uninstaller only removes VelocityUI and its related files.${RESET}"
echo -e "  ${GREEN}It will never touch unrelated apps or system files.${RESET}"
echo
echo -e "  ${DIM}Nothing happens automatically — you will confirm before anything is deleted.${RESET}"
echo

declare -a FOUND_PATHS=()
check() {
  local path="$1"
  if [ -e "$path" ]; then
    FOUND_PATHS+=("$path")
  fi
}
check "$APP_BUNDLE"
check "$VELOCITYUI_DATA"
check "$TAURI_APP_SUPPORT"
check "$TAURI_CACHE"
check "$TAURI_LOGS"
check "$TAURI_SAVED_STATE"
check "$TAURI_WEBVIEW_CACHE"

if [ ${#FOUND_PATHS[@]} -eq 0 ]; then
  echo -e "  ${GREEN}Nothing to remove. VelocityUI does not appear to be installed.${RESET}"
  echo
  exit 0
fi

# If no mode passed, ask the user
if [ -z "$MODE" ]; then
  if $NON_INTERACTIVE; then
    MODE="full"
  else
    echo -e "  ${BOLD}Select uninstall mode:${RESET}"
    echo
    echo -e "  ${CYAN}1)${RESET} ${BOLD}--clean${RESET}   Remove app + system files, keep ${DIM}~/VelocityUI/workspace${RESET}"
    echo -e "  ${CYAN}2)${RESET} ${BOLD}--full${RESET}    Remove everything"
    echo -e "  ${CYAN}3)${RESET} ${BOLD}--app${RESET}     Remove app bundle only"
    echo
    while true; do
      echo -en "  ${BOLD}?${RESET}  Choose [1/2/3]: "
      read -r reply </dev/tty || { MODE="full"; break; }
      case "$reply" in
        1|clean|--clean)  MODE="clean"; break ;;
        2|full|--full)    MODE="full";  break ;;
        3|app|--app)      MODE="app";   break ;;
        *) echo -e "  ${YELLOW}Please enter 1, 2, or 3.${RESET}" ;;
      esac
    done
  fi
fi

# Set removal flags based on mode
REMOVE_APP=false
REMOVE_VELOCITYUI_DATA=false
REMOVE_INTERNALS=false
REMOVE_APP_SUPPORT=false
REMOVE_CACHE=false
REMOVE_LOGS=false
REMOVE_SAVED_STATE=false
REMOVE_WEBKIT=false

case "$MODE" in
  clean)
    REMOVE_APP=true
    REMOVE_INTERNALS=true
    REMOVE_APP_SUPPORT=true
    REMOVE_CACHE=true
    REMOVE_LOGS=true
    REMOVE_SAVED_STATE=true
    REMOVE_WEBKIT=true
    ;;
  full)
    REMOVE_APP=true
    REMOVE_VELOCITYUI_DATA=true
    REMOVE_APP_SUPPORT=true
    REMOVE_CACHE=true
    REMOVE_LOGS=true
    REMOVE_SAVED_STATE=true
    REMOVE_WEBKIT=true
    ;;
  app)
    REMOVE_APP=true
    ;;
esac

TOTAL_STEPS=5

step 1 $TOTAL_STEPS "Closing VelocityUI"
if pgrep -xq "VelocityUI" 2>/dev/null || pgrep -xq "VelocityUIBar" 2>/dev/null; then
  warn "VelocityUI is running — quitting..."
  pkill -x "VelocityUI" 2>/dev/null || true
  pkill -x "VelocityUIBar" 2>/dev/null || true
  ok "Closed"
else
  ok "Not running"
fi

step 2 $TOTAL_STEPS "Mode: --${MODE}"
echo
case "$MODE" in
  clean)
    echo -e "  ${RED}✗${RESET}  VelocityUI.app"
    echo -e "  ${RED}✗${RESET}  ~/VelocityUI/internals"
    echo -e "  ${DIM}–  ~/VelocityUI/workspace ${GREEN}(kept)${RESET}"
    echo -e "  ${RED}✗${RESET}  App Support"
    echo -e "  ${RED}✗${RESET}  Cache"
    echo -e "  ${RED}✗${RESET}  Logs"
    echo -e "  ${RED}✗${RESET}  Saved state"
    echo -e "  ${RED}✗${RESET}  WebKit cache"
    ;;
  full)
    echo -e "  ${RED}✗${RESET}  VelocityUI.app"
    echo -e "  ${RED}✗${RESET}  ~/VelocityUI"
    echo -e "  ${RED}✗${RESET}  App Support"
    echo -e "  ${RED}✗${RESET}  Cache"
    echo -e "  ${RED}✗${RESET}  Logs"
    echo -e "  ${RED}✗${RESET}  Saved state"
    echo -e "  ${RED}✗${RESET}  WebKit cache"
    ;;
  app)
    echo -e "  ${RED}✗${RESET}  VelocityUI.app"
    echo -e "  ${DIM}–  ~/VelocityUI (kept)${RESET}"
    echo -e "  ${DIM}–  System files (kept)${RESET}"
    ;;
esac

step 3 $TOTAL_STEPS "Confirm"
echo
echo -e "  ${DIM}Only the items listed above will be removed.${RESET}"
echo -e "  ${YELLOW}This action cannot be undone.${RESET}"
echo
if ! ask "Proceed?"; then
  echo -e "\n  ${CYAN}Cancelled.${RESET}\n"
  exit 0
fi

step 4 $TOTAL_STEPS "Removing files"
ERRORS=0
del() {
  local path="$1" label="$2"
  if [ -e "$path" ]; then
    if rm -rf "$path" 2>/dev/null; then
      removed "$label"
    else
      warn "Failed: $label"
      ERRORS=$((ERRORS+1))
    fi
  else
    skip "$label"
  fi
}

$REMOVE_APP && del "$APP_BUNDLE" "VelocityUI.app"

if [ "$MODE" = "clean" ]; then
  del "$VELOCITYUI_DATA/internals" "~/VelocityUI/internals"
elif $REMOVE_VELOCITYUI_DATA; then
  del "$VELOCITYUI_DATA" "~/VelocityUI"
fi

$REMOVE_APP_SUPPORT  && del "$TAURI_APP_SUPPORT" "App Support"
$REMOVE_CACHE        && del "$TAURI_CACHE"        "Cache"
$REMOVE_LOGS         && del "$TAURI_LOGS"         "Logs"
$REMOVE_SAVED_STATE  && del "$TAURI_SAVED_STATE"  "Saved state"
$REMOVE_WEBKIT       && del "$TAURI_WEBVIEW_CACHE" "WebKit cache"

step 5 $TOTAL_STEPS "Done"
echo
rule
if [ "$ERRORS" -eq 0 ]; then
  echo
  echo -e "  ${GREEN}${BOLD}✓ VelocityUI successfully removed${RESET}"
  echo -e "  ${DIM}Your system is unchanged beyond the files listed above.${RESET}"
else
  echo
  echo -e "  ${YELLOW}${BOLD}Completed with $ERRORS issue(s)${RESET}"
fi
echo