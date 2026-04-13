#!/bin/bash

set -Eeuo pipefail
trap 'echo -e "\033[31m✗ Error on line $LINENO\033[0m"; exit 1' ERR

REPO="dawnpetal/Velocity"
APP_NAME="Velocity"
INSTALL_DIR="/Applications"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
TMP_DIR="/tmp/${APP_NAME}_install_$$"
TMP_ZIP="${TMP_DIR}/${APP_NAME}.zip"

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

command -v curl >/dev/null || die "curl is required but not installed."
command -v unzip >/dev/null || die "unzip is required but not installed."
command -v jq >/dev/null || die "jq is required but not installed."

if [ ! -w "$INSTALL_DIR" ]; then
  echo ""
  warn "Administrator permission required to install to $INSTALL_DIR"
  exec sudo bash "$0" "$@"
fi

mkdir -p "$TMP_DIR"

header "Fetching latest release..."

API_URL="https://api.github.com/repos/${REPO}/releases/latest"
RELEASE_JSON=$(curl -fsSL "$API_URL") || die "Could not reach GitHub. Check your internet connection."

VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name')
[ -n "$VERSION" ] || die "Could not determine latest release version."
success "Latest version: ${VERSION}"

ASSET_NAME="${APP_NAME}-mac_universal.zip"
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name==\"$ASSET_NAME\") | .browser_download_url")
[ -n "$DOWNLOAD_URL" ] || die "No asset named '$ASSET_NAME' found in release ${VERSION}."
info "Asset: $ASSET_NAME"

header "Downloading ${APP_NAME} ${VERSION}..."
info "Downloading archive..."

curl -fL --progress-bar "$DOWNLOAD_URL" -o "$TMP_ZIP" || die "Download failed. Please check your connection."
success "Downloaded"

header "Installing to ${INSTALL_DIR}..."

info "Extracting files..."
unzip -q "$TMP_ZIP" -d "$TMP_DIR" || die "Failed to unzip archive. The download may be corrupted."

APP_BUNDLE=$(find "$TMP_DIR" -maxdepth 2 -name "*.app" -type d | head -1)
[ -n "$APP_BUNDLE" ] || die "No .app bundle found in the archive."

if [ -d "$APP_PATH" ]; then
  warn "Existing installation found — replacing..."
  rm -rf "$APP_PATH"
fi

info "Copying application..."
cp -R "$APP_BUNDLE" "$INSTALL_DIR/" || die "Could not copy to $INSTALL_DIR."

success "Installed to $APP_PATH"

header "Finalizing installation..."

info "Clearing Gatekeeper restrictions, you may have to enter your macOS password..."
info "The password would not be visible when you type, that's normal. Just type it and press Enter, you get 3 tries before the installation fails."
info "You may ask ChatGPT about this step if you want to learn more, it's a common process for all apps (from unverified developers like me) downloaded from the internet on macOS."
sudo xattr -cr "$APP_PATH" || die "Failed to remove macOS security restrictions."

success "Ready to launch"

echo ""
echo -e "  ${GREEN}${BOLD}Velocity ${VERSION} is ready.${RESET}"
echo ""

if [ -t 0 ]; then
  read -r -p "  Launch now? (y/n): " LAUNCH
  if [[ "$LAUNCH" =~ ^[Yy]$ ]]; then
    echo ""
    info "Launching ${APP_NAME}..."
    if ! open "$APP_PATH" 2>/dev/null; then
      warn "Could not launch automatically. Open Velocity from /Applications manually."
    fi
  fi
fi

echo -e "  ${CYAN}Thank you for choosing Velocity!${RESET}"
echo -e "  ${DIM}Always be careful when downloading software from the internet, do not trust unknown sources.${RESET}"
echo