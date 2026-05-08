#!/bin/bash

set -Eeuo pipefail
trap 'echo -e "\033[31m✗ Error on line $LINENO\033[0m"; exit 1' ERR

REPO="dawnpetal/VelocityUI"
APP_NAME="VelocityUI"
INSTALL_DIR="/Applications"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
TMP_DIR="/tmp/${APP_NAME}_install_$$"
TMP_ZIP="${TMP_DIR}/${APP_NAME}.zip"
PINNED_VERSION=""

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
die()     { echo -e "  ${RED}✗${RESET}  $*" >&2; rm -rf "$TMP_DIR"; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

for arg in "$@"; do
  if [[ "$arg" =~ ^--v(.+)$ ]]; then
    PINNED_VERSION="${BASH_REMATCH[1]}"
  fi
done

echo -e "${BOLD}"
echo "  ██╗   ██╗███████╗██╗      ██████╗  ██████╗██╗████████╗██╗   ██╗"
echo "  ██║   ██║██╔════╝██║     ██╔═══██╗██╔════╝██║╚══██╔══╝╚██╗ ██╔╝"
echo "  ██║   ██║█████╗  ██║     ██║   ██║██║     ██║   ██║    ╚████╔╝ "
echo "  ╚██╗ ██╔╝██╔══╝  ██║     ██║   ██║██║     ██║   ██║     ╚██╔╝  "
echo "   ╚████╔╝ ███████╗███████╗╚██████╔╝╚██████╗██║   ██║      ██║   "
echo "    ╚═══╝  ╚══════╝╚══════╝ ╚═════╝  ╚═════╝╚═╝   ╚═╝      ╚═╝  "
echo -e "${RESET}"
echo -e "  ${DIM}macOS Installer · github.com/${REPO}${RESET}"
echo ""

header "Checking system..."

[ "$(uname -s)" = "Darwin" ] || die "This installer is for macOS only."
success "macOS $(sw_vers -productVersion)"

command -v curl  >/dev/null || die "curl is required but not installed."
command -v unzip >/dev/null || die "unzip is required but not installed."
command -v jq    >/dev/null || die "jq is required but not installed."

if [ ! -w "$INSTALL_DIR" ]; then
  echo ""
  warn "Administrator permission required to install to $INSTALL_DIR."
  exec sudo bash "$0" "$@"
fi

mkdir -p "$TMP_DIR"

if [ -n "$PINNED_VERSION" ]; then
  header "Fetching release v${PINNED_VERSION}..."
  API_URL="https://api.github.com/repos/${REPO}/releases/tags/v${PINNED_VERSION}"
  RELEASE_JSON=$(curl -fsSL "$API_URL") || die "Could not reach GitHub. Check your connection."

  if echo "$RELEASE_JSON" | jq -e '.message == "Not Found"' >/dev/null 2>&1; then
    die "Release v${PINNED_VERSION} not found. Check the version and try again."
  fi

  VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name')
  success "Version: ${VERSION}"
else
  header "Fetching latest release..."
  API_URL="https://api.github.com/repos/${REPO}/releases/latest"
  RELEASE_JSON=$(curl -fsSL "$API_URL") || die "Could not reach GitHub. Check your connection."
  VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name')
  [ -n "$VERSION" ] || die "Could not determine latest version."
  success "Latest version: ${VERSION}"
fi

ASSET_NAME="${APP_NAME}-mac_universal.zip"
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name==\"$ASSET_NAME\") | .browser_download_url")
[ -n "$DOWNLOAD_URL" ] || die "No asset named '$ASSET_NAME' found in release ${VERSION}."
info "Asset: $ASSET_NAME"

header "Downloading ${APP_NAME} ${VERSION}..."

curl -fL --progress-bar "$DOWNLOAD_URL" -o "$TMP_ZIP" || die "Download failed. Check your connection."
success "Downloaded"

header "Installing to ${INSTALL_DIR}..."

info "Extracting..."
unzip -q "$TMP_ZIP" -d "$TMP_DIR" || die "Failed to extract — the download may be corrupted."

APP_BUNDLE=$(find "$TMP_DIR" -maxdepth 2 -name "*.app" -type d | head -1)
[ -n "$APP_BUNDLE" ] || die "No .app bundle found in the archive."

if [ -d "$APP_PATH" ]; then
  warn "Existing installation found — replacing..."
  rm -rf "$APP_PATH"
fi

info "Copying to /Applications..."
cp -R "$APP_BUNDLE" "$INSTALL_DIR/" || die "Could not copy to $INSTALL_DIR."
success "Installed to $APP_PATH"

header "Finalizing..."

info "Removing Gatekeeper quarantine..."
echo ""
echo -e "  ${DIM}macOS flags apps downloaded from the internet as untrusted. This next"
echo -e "  step lifts that restriction for VelocityUI — it's standard practice for"
echo -e "  apps distributed outside the App Store. You may be prompted for your"
echo -e "  password. It won't be visible as you type; just press Enter when done.${RESET}"
echo ""
sudo xattr -cr "$APP_PATH" || die "Failed to remove Gatekeeper restrictions."
success "Done"

echo ""
echo -e "  ${GREEN}${BOLD}VelocityUI ${VERSION} is installed.${RESET}"
echo ""

if [ -t 0 ]; then
  read -r -p "  Launch now? (y/n): " LAUNCH
  if [[ "$LAUNCH" =~ ^[Yy]$ ]]; then
    echo ""
    info "Launching ${APP_NAME}..."
    open "$APP_PATH" 2>/dev/null || warn "Couldn't launch automatically open VelocityUI from /Applications."
  fi
fi

echo ""
echo -e "  ${DIM}Only install software from sources you trust.${RESET}"
echo ""