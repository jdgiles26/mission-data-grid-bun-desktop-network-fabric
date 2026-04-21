#!/bin/bash

# Mission Data Grid - Development Mode with Hot Reload

cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}    Mission Data Grid - Development Mode (Hot Reload)     ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

if ! command -v bun &> /dev/null; then
    echo -e "${RED}✗ Bun not installed${NC}"
    echo "Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    bun install
fi

echo -e "${GREEN}Starting development server...${NC}"
echo ""
echo -e "${YELLOW}Features:${NC}"
echo "  • Hot reload on file changes"
echo "  • Debug console output"
echo "  • Auto-restart on crashes"
echo ""
echo -e "${BLUE}Press Ctrl+C to stop${NC}"
echo ""

bun run dev

echo ""
echo -e "${GREEN}Development server stopped${NC}"
