#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

CHECK="${GREEN}✔${NC}"
CROSS="${RED}✖${NC}"
INFO="${CYAN}➜${NC}"

DYLIB_URL="https://q3p1xj20dh.ufs.sh/f/BrzckOVD7pCZ6elqt1APoG9r4vYaKLmwnXuiB62q3pUVDhS1"
MODULES_URL="https://x099xkycxe.ufs.sh/f/ar75CUBjeUn9zb5N2U71NMWOXBTIwjKh0pvSDLcxH6FERayu"
UI_URL="https://q3p1xj20dh.ufs.sh/f/BrzckOVD7pCZXic4yblOrXx5SwcQKWkvE8P629ny4DmGCYVA"

ARCH=$(uname -m)
echo -e "${INFO} Detected architecture: $ARCH"

if [[ "$ARCH" != "arm64" ]]; then
    echo -e "${INFO} Your system does not use Apple Silicon (ARM64). Exiting installer."
    exit 0
fi

APP_DIR="/Applications"
if [ ! -w "$APP_DIR" ]; then
    APP_DIR="$HOME/Applications"
    echo -e "${INFO} No write access to /Applications, using $APP_DIR."
fi

TEMP="$(mktemp -d)"
echo -e "${INFO} Using temporary directory: $TEMP"

# Helper function to log errors without terminating
log_error() {
    local error_message="$1"
    echo -e "${RED}${CROSS} ERROR: $error_message${NC}"
}

# Helper function to log success
log_success() {
    local success_message="$1"
    echo -e "${GREEN}${CHECK} SUCCESS: $success_message${NC}"
}

# Helper function to safely execute commands and log them
execute_command() {
    local cmd="$1"
    echo -e "${INFO} Executing: $cmd"
    if ! eval "$cmd"; then
        log_error "Command failed: $cmd"
        return 1
    fi
    return 0
}

spinner() {
    local msg="$1"
    local pid="$2"
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0

    wait "$pid"
    printf "\r\033[K"
    printf "${GREEN}${CHECK} %s - Completed${NC}\n" "$msg"
}

section() {
    echo -e "\n${BOLD}${CYAN}==> $1${NC}"
}

main() {
    section "Killing existing Roblox or Opiumware processes"
    execute_command "killall -9 RobloxPlayer Opiumware &>/dev/null || true"

    section "Removing existing Roblox/Opiumware apps"
    for target in "$APP_DIR/Roblox.app" "$APP_DIR/Opiumware.app"; do
        if [ -e "$target" ]; then
            echo -e "${INFO} Found $target, attempting to delete..."
            execute_command "rm -rf $target" || log_error "Failed to remove $target"
        fi
    done

    section "Cleaning up old modules"
    execute_command "rm -rf ~/Opiumware/modules/LuauLSP ~/Opiumware/modules/decompiler"
    execute_command "rm -f ~/Opiumware/modules/update.json 2>/dev/null"

    section "Fetching latest client version"
    local version="version-08d2b9589bf14135"
    echo -e "${INFO} Using version: ${BOLD}$version${NC}"

    section "Downloading Roblox Player"
    local download_url="https://setup.rbxcdn.com/mac/arm64/$version-RobloxPlayer.zip"
    echo -e "${INFO} Downloading from: $download_url"
    execute_command "curl -# -L $download_url -o $TEMP/RobloxPlayer.zip"
    execute_command "unzip -oq $TEMP/RobloxPlayer.zip -d $TEMP"
    execute_command "mv $TEMP/RobloxPlayer.app $APP_DIR/Roblox.app"
    execute_command "xattr -cr $APP_DIR/Roblox.app"

    section "Installing Opiumware modules"
    echo -e "${INFO} Downloading and installing Opiumware native library..."
    execute_command "curl -# -L $DYLIB_URL -o $TEMP/libOpiumwareNative.zip"
    execute_command "unzip -oq $TEMP/libOpiumwareNative.zip -d $TEMP"
    execute_command "mv $TEMP/libOpiumwareNative.dylib $APP_DIR/Roblox.app/Contents/Resources/libOpiumwareNative.dylib"

    section "Downloading and installing Opiumware modules"
    echo -e "${INFO} Downloading and extracting Opiumware modules..."
    execute_command "curl -# -L $MODULES_URL -o $TEMP/modules.zip"
    execute_command "unzip -oq $TEMP/modules.zip -d $TEMP"

    section "Running Injector to patch Roblox"
    echo -e "${INFO} Running the Injector to patch Roblox app..."
    local injector_path="$TEMP/Resources/Injector"
    execute_command "$injector_path $APP_DIR/Roblox.app/Contents/Resources/libOpiumwareNative.dylib $APP_DIR/Roblox.app/Contents/MacOS/libmimalloc.3.dylib --strip-codesig --all-yes"

    section "Patching libmimalloc"
    execute_command "mv $APP_DIR/Roblox.app/Contents/MacOS/libmimalloc.3.dylib_patched $APP_DIR/Roblox.app/Contents/MacOS/libmimalloc.3.dylib"

    section "Cleaning up residual installer files"
    execute_command "rm -rf $APP_DIR/Roblox.app/Contents/MacOS/RobloxPlayerInstaller.app"

    section "Code signing Roblox app"
    echo -e "${INFO} Code signing Roblox app..."
    execute_command "codesign --force --deep --sign - $APP_DIR/Roblox.app"
    execute_command "tccutil reset Accessibility com.Roblox.RobloxPlayer"

    section "Downloading and installing Opiumware UI"
    echo -e "${INFO} Downloading Opiumware UI"
    execute_command "curl -# -L $UI_URL -o $TEMP/OpiumwareUI.zip"
    execute_command "unzip -oq $TEMP/OpiumwareUI.zip -d $TEMP"

    section "Setting up Opiumware workspace"
    execute_command "mkdir -p ~/Opiumware/workspace ~/Opiumware/autoexec ~/Opiumware/themes ~/Opiumware/modules ~/Opiumware/modules/decompiler ~/Opiumware/modules/LuauLSP"
    execute_command "mv -f $TEMP/Resources/decompiler ~/Opiumware/modules/decompiler/Decompiler"
    execute_command "mv -f $TEMP/Resources/LuauLSP ~/Opiumware/modules/LuauLSP/LuauLSP"
    execute_command "mv -f $TEMP/Opiumware.app $APP_DIR/Opiumware.app"

    section "Code signing Opiumware app"
    echo -e "${INFO} Code signing Opiumware app..."
    execute_command "codesign --force --deep --sign - $APP_DIR/Opiumware.app"

    section "Installation complete"
    log_success "Opiumware and Roblox installed successfully."
    open "$APP_DIR/Roblox.app"
    open "$APP_DIR/Opiumware.app"
    execute_command "tccutil reset ScreenCapture com.norbyv1.opiumware"

    rm -rf "$TEMP"
}

main
