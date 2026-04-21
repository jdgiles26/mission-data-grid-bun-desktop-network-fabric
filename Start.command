#!/bin/bash

# Mission Data Grid - Quick Start
# Launches existing build or builds if needed

cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}          Mission Data Grid - Quick Start                 ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Find existing app
APP_PATH=$(find build -name "*.app" -type d 2>/dev/null | head -n 1)

if [ -n "$APP_PATH" ]; then
    FULL_PATH="$(cd "$(dirname "$APP_PATH")" && pwd)/$(basename "$APP_PATH")"
    echo -e "${BLUE}Found existing app:${NC}"
    echo "  $FULL_PATH"
    echo ""
    echo -e "${YELLOW}► Launching...${NC}"
    echo ""
    
    open "$FULL_PATH"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Mission Data Grid is running!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Failed to launch${NC}"
    fi
else
    echo -e "${YELLOW}No existing build found${NC}"
    echo ""
fi

# No existing build, ask to build
echo -e "${YELLOW}Would you like to build now?${NC}"
echo ""

osascript -e '
    display dialog "No existing build found. Would you like to build Mission Data Grid now?\n\nThis will take 1-2 minutes." buttons {"Cancel", "Build Dev", "Build Production"} default button "Build Dev" with icon note
' | grep -q "Build"

RESULT=$?

if [ $RESULT -eq 0 ]; then
    # User clicked a build button
    osascript -e '
        display dialog "Choose build type:" buttons {"Cancel", "Development", "Production"} default button "Development"
    ' | grep -q "Development"
    
    if [ $? -eq 0 ]; then
        echo -e "${YELLOW}Starting Development Build...${NC}"
        exec ./Build-Dev.command
    else
        echo -e "${YELLOW}Starting Production Build...${NC}"
        exec ./Build-Production.command
    fi
else
    echo "Cancelled"
    exit 0
fi
