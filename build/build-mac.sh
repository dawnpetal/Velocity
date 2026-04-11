#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="Velocity"
REPO="dawnpetal/Velocity"
BUNDLE_DIR="src-tauri/target/release/bundle/macos"
DIST_DIR="dist"
DO_RELEASE=false

for arg in "$@"; do
  [ "$arg" = "--release" ] && DO_RELEASE=true
done

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

_prepare_app() {
  local app="$1"

  info "Normalizing bundle..."

  xattr -cr "$app" 2>/dev/null || true

  find "$app" -type f -print0 | while IFS= read -r -d '' bin; do
    if file "$bin" 2>/dev/null | grep -q "Mach-O"; then
      strip -S -x "$bin" 2>/dev/null || true
    fi
  done

  find "$app" -exec touch -h -t 202001010000 {} +

  find "$app" -name ".DS_Store" -delete 2>/dev/null || true
}

_zip_clean() {
  local src_dir="$1"
  local app_name="$2"
  local out_zip="$3"

  (
    cd "$src_dir"
    local -a paths=()
    while IFS= read -r -d '' p; do
      paths+=("$p")
    done < <(find "${app_name}.app" -print0 | sort -z)

    LC_ALL=C \
    TZ=UTC \
    SOURCE_DATE_EPOCH=1577836800 \
    zip -qX "$out_zip" "${paths[@]}"
  )
}

header "Velocity — macOS Build"
echo -e "${DIM}  repo: $REPO${RESET}\n"

header "Checking prerequisites..."

[ "$(uname -s)" = "Darwin" ] || die "This script is for macOS only."

command -v cargo &>/dev/null || die "cargo not found. Install Rust → https://rustup.rs"
success "cargo $(cargo --version | awk '{print $2}')"

if ! cargo tauri --version &>/dev/null 2>&1; then
  info "tauri-cli not found — installing..."
  cargo install tauri-cli --version "^2" --locked
fi
success "tauri-cli $(cargo tauri --version 2>/dev/null | head -1)"

[ -f "src-tauri/icons/app.icns" ] && [ -f "src-tauri/icons/app.png" ] || \
  die "Icons missing at src-tauri/icons/. Provide app.icns and app.png."
success "Icons found"

if [ "$DO_RELEASE" = true ]; then
  command -v gh &>/dev/null || die "gh CLI not found. Install → https://cli.github.com"
  success "gh $(gh --version | head -1 | awk '{print $3}')"

  header "Checking Rust targets for universal build..."
  for TARGET in aarch64-apple-darwin x86_64-apple-darwin; do
    if ! rustup target list --installed 2>/dev/null | grep -q "$TARGET"; then
      info "Adding $TARGET..."
      rustup target add "$TARGET"
    fi
    success "$TARGET"
  done
fi

if [ "$DO_RELEASE" = true ]; then

  header "Release details"
  echo ""
  read -r -p "  Version (e.g. 1.0.0): " VERSION
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Version must be semver (e.g. 1.0.0)"
  read -r -p "  Release title:         " TITLE
  [ -z "$TITLE" ] && TITLE="Velocity v${VERSION}"
  echo "  Release notes (press Enter twice when done):"
  NOTES=""
  while IFS= read -r line; do
    [ -z "$line" ] && break
    NOTES="${NOTES}${line}\n"
  done
  NOTES=$(echo -e "$NOTES" | sed 's/\\n$//')

  echo ""
  info "Version : v${VERSION}"
  info "Title   : ${TITLE}"
  info "Notes   : ${NOTES:-"(none)"}"
  echo ""
  read -r -p "  Looks good? (y/n): " CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || { warn "Aborted."; exit 0; }

  header "Building universal binary (arm64 + x86_64)..."
  cargo tauri build --target universal-apple-darwin --bundles app

  UNIVERSAL_BUNDLE="src-tauri/target/universal-apple-darwin/release/bundle/macos"
  APP_PATH="${UNIVERSAL_BUNDLE}/${APP_NAME}.app"
  [ -d "$APP_PATH" ] || die ".app not found at $APP_PATH"
  success "Built: $APP_PATH"

  header "Optimizing build..."
  _prepare_app "$APP_PATH"
  success "Ready"

  mkdir -p "$DIST_DIR"
  ZIP_NAME="${APP_NAME}-mac_universal.zip"
  ZIP_PATH="$(pwd)/${DIST_DIR}/${ZIP_NAME}"

  header "Packaging..."
  _zip_clean "$UNIVERSAL_BUNDLE" "$APP_NAME" "$ZIP_PATH"
  success "Zipped: ${DIST_DIR}/${ZIP_NAME}"

  CHECKSUM=$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')
  success "SHA-256: $CHECKSUM"

  RELEASE_NOTES="${NOTES}

---
**Installation**
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash
\`\`\`
Or download the zip below and drag **${APP_NAME}.app** to /Applications.

**SHA-256** \`${CHECKSUM}\`"

  header "Creating GitHub release v${VERSION}..."
  gh release create "v${VERSION}" \
    "$ZIP_PATH" \
    --repo "$REPO" \
    --title "$TITLE" \
    --notes "$RELEASE_NOTES"

  echo ""
  success "Released → https://github.com/${REPO}/releases/tag/v${VERSION}"

else

  header "Building (local, unsigned)..."
  cargo tauri build --bundles app

  APP_PATH="${BUNDLE_DIR}/${APP_NAME}.app"
  [ -d "$APP_PATH" ] || die ".app not found at $APP_PATH"

  header "Optimizing build..."
  _prepare_app "$APP_PATH"
  success "Ready"

  mkdir -p "$DIST_DIR"
  ZIP_PATH="$(pwd)/${DIST_DIR}/${APP_NAME}-mac.zip"

  header "Packaging..."
  _zip_clean "$BUNDLE_DIR" "$APP_NAME" "$ZIP_PATH"
  success "Build complete → ${DIST_DIR}/${APP_NAME}-mac.zip"

  echo ""
  read -r -p "  Launch now? (y/n): " LAUNCH
  if [[ "$LAUNCH" =~ ^[Yy]$ ]]; then
    info "Launching ${APP_NAME}..."
    open "${BUNDLE_DIR}/${APP_NAME}.app"
  fi

fi

echo ""