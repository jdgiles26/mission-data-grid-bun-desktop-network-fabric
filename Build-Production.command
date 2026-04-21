#!/bin/bash

# Mission Data Grid - Production Build
# Creates optimized release build

cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}    Mission Data Grid - Production Build                  ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}► Checking prerequisites...${NC}"

if ! command -v bun &> /dev/null; then
    echo -e "${RED}✗ Bun not found${NC}"
    osascript -e 'display dialog "Bun is not installed.\n\nInstall: curl -fsSL https://bun.sh/install | bash" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

echo -e "${GREEN}✓ Bun found${NC}"

# Install dependencies
if [ ! -d "node_modules/electrobun" ]; then
    echo ""
    echo -e "${YELLOW}► Installing dependencies...${NC}"
    bun install
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to install dependencies${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# Clean builds
echo ""
echo -e "${YELLOW}► Cleaning previous builds...${NC}"
rm -rf build dist release
echo -e "${GREEN}✓ Cleaned${NC}"

# Build
echo ""
echo -e "${YELLOW}► Building PRODUCTION version...${NC}"
echo -e "${BLUE}  This will take 2-3 minutes...${NC}"
echo ""

bun run build:release 2>&1 | tee /tmp/build-release.log

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║${NC}           PRODUCTION BUILD FAILED                        ${RED}║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
    osascript -e 'display dialog "Production build failed" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}           PRODUCTION BUILD SUCCESSFUL                    ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Find app
APP_PATH=$(find build -name "*.app" ! -name "*-dev.app" -type d 2>/dev/null | head -n 1)

if [ -z "$APP_PATH" ]; then
    APP_PATH=$(find build -name "*.app" -type d 2>/dev/null | head -n 1)
fi

if [ -n "$APP_PATH" ]; then
    FULL_PATH="$(cd "$(dirname "$APP_PATH")" && pwd)/$(basename "$APP_PATH")"
    APP_SIZE=$(du -sh "$APP_PATH" 2>/dev/null | cut -f1)
    
    echo -e "${BLUE}Production App:${NC}"
    echo "  $FULL_PATH"
    echo ""
    echo -e "${BLUE}Size:${NC} $APP_SIZE"
    echo ""
    
    # Create shortcut on Desktop
    DESKTOP_APP="$HOME/Desktop/Mission Data Grid.app"
    if [ -L "$DESKTOP_APP" ]; then
        rm "$DESKTOP_APP"
    fi
    
    ln -sf "$FULL_PATH" "$DESKTOP_APP"
    echo -e "${GREEN}✓ Created Desktop shortcut${NC}"
    echo ""
    
    # Create DMG if possible
    if command -v create-dmg &> /dev/null; then
        echo -e "${YELLOW}► Creating DMG installer...${NC}"
        DMG_NAME="MissionDataGrid-$(date +%Y%m%d).dmg"
        create-dmg \
            --volname "Mission Data Grid" \
            --window-pos 200 120 \
            --window-size 800 400 \
            --icon-size 100 \
            --app-drop-link 600 185 \
            "$DMG_NAME" \
            "$APP_PATH" 2>/dev/null
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ DMG created: $DMG_NAME${NC}"
            mv "$DMG_NAME" "$HOME/Desktop/"
            echo -e "${GREEN}✓ Moved to Desktop${NC}"
        fi
        echo ""
    fi
    
    # Launch
    echo -e "${YELLOW}► Launching application...${NC}"
    echo ""
    open "$FULL_PATH"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Application launched${NC}"
        echo ""
        echo -e "${GREEN}Mission Data Grid is now running!${NC}"
        osascript -e 'display notification "Production build ready" with title "Mission Data Grid"'
    fi
else
    echo -e "${RED}✗ Could not find built app${NC}"
fi

exit 0
