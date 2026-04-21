#!/bin/bash

# Mission Data Grid - Development Build & Run
# Double-click to build and launch the app

cd "$(dirname "$0")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}       Mission Data Grid - Development Build              ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}► Checking prerequisites...${NC}"

if ! command -v bun &> /dev/null; then
    echo -e "${RED}✗ Bun not found${NC}"
    echo ""
    echo "Please install Bun:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    echo ""
    osascript -e 'display dialog "Bun is not installed. Please install it first.\n\nRun: curl -fsSL https://bun.sh/install | bash" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

echo -e "${GREEN}✓ Bun found${NC}"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "node_modules/electrobun" ]; then
    echo ""
    echo -e "${YELLOW}► Installing dependencies...${NC}"
    bun install
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to install dependencies${NC}"
        osascript -e 'display dialog "Failed to install dependencies" buttons {"OK"} default button "OK" with icon stop'
        exit 1
    fi
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# Clean previous build
echo ""
echo -e "${YELLOW}► Cleaning previous build...${NC}"
rm -rf build dist
echo -e "${GREEN}✓ Cleaned${NC}"

# Build the application
echo ""
echo -e "${YELLOW}► Building application...${NC}"
echo -e "${BLUE}  This may take 1-2 minutes...${NC}"
echo ""

bun run build 2>&1 | tee /tmp/build.log

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║${NC}              BUILD FAILED                                ${RED}║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Check /tmp/build.log for details"
    osascript -e 'display dialog "Build failed. Check the terminal output for details." buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}              BUILD SUCCESSFUL                            ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Find the built app
APP_PATH=$(find build -name "*.app" -type d 2>/dev/null | head -n 1)

if [ -n "$APP_PATH" ]; then
    FULL_PATH="$(cd "$(dirname "$APP_PATH")" && pwd)/$(basename "$APP_PATH")"
    APP_SIZE=$(du -sh "$APP_PATH" 2>/dev/null | cut -f1)
    
    echo -e "${BLUE}App Location:${NC}"
    echo "  $FULL_PATH"
    echo ""
    echo -e "${BLUE}App Size:${NC} $APP_SIZE"
    echo ""
    
    # Launch the app
    echo -e "${YELLOW}► Launching application...${NC}"
    echo ""
    
    open "$FULL_PATH"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Application launched${NC}"
        echo ""
        echo -e "${GREEN}Mission Data Grid is now running!${NC}"
        echo ""
        sleep 2
    else
        echo -e "${RED}✗ Failed to launch application${NC}"
        osascript -e 'display dialog "Build succeeded but failed to launch app" buttons {"OK"} default button "OK" with icon caution'
    fi
else
    echo -e "${RED}✗ Could not find built app${NC}"
    osascript -e 'display dialog "Build succeeded but could not find app" buttons {"OK"} default button "OK" with icon caution'
fi

exit 0
