# Mission Data Grid - Build Instructions

## Quick Start (Double-Click)

### 🚀 Start.command
**Quickest way to run the app.**
- If app is already built: Launches it immediately
- If not built: Prompts to build first
- Double-click and go!

### 🔨 Build-Dev.command
**Build and run development version.**
- Builds the app with debug symbols
- Installs dependencies if needed
- Launches the app automatically
- Opens in Terminal to show build progress

### 🏭 Build-Production.command
**Build optimized production release.**
- Creates optimized, release-ready app
- Creates Desktop shortcut automatically
- Optionally creates DMG installer
- Launches the app when done

### 🔄 Run-Dev-Mode.command
**Development mode with hot reload.**
- Starts development server
- Auto-reloads when files change
- Shows debug output in Terminal
- Best for active development

## Manual Build Commands

```bash
cd apps/mission-data-grid

# Install dependencies
bun install

# Development build
bun run build

# Production build
bun run build:release

# Development mode (hot reload)
bun run dev
```

## Build Output

After building, the app is located at:

**Development:**
```
build/dev-macos-arm64/Mission Data Grid-dev.app
```

**Production:**
```
build/macos-arm64/Mission Data Grid.app
```

## Requirements

- macOS (ARM64 or Intel)
- [Bun](https://bun.sh) runtime: `curl -fsSL https://bun.sh/install | bash`
- ~100MB free space for build

## Troubleshooting

### "Bundle failed" error
```bash
# Clean and rebuild
rm -rf build dist node_modules
bun install
bun run build
```

### Permission denied
```bash
chmod +x *.command
```

### Bun not found
Install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

### App won't launch
1. Check macOS Security & Privacy settings
2. Right-click the app → Open (first time only)
3. Check Console.app for crash logs

## Build Scripts Reference

| Script | Purpose | Creates Desktop Icon | Build Time |
|--------|---------|---------------------|------------|
| Start.command | Quick launch | - | - |
| Build-Dev.command | Development build | No | ~1 min |
| Build-Production.command | Release build | Yes | ~2 min |
| Run-Dev-Mode.command | Dev server | No | - |

## Production Distribution

After `Build-Production.command`:

1. **App:** `build/macos-arm64/Mission Data Grid.app`
2. **Desktop shortcut:** Created automatically
3. **DMG:** `Desktop/MissionDataGrid-YYYYMMDD.dmg` (if create-dmg installed)

To distribute:
- ZIP the `.app` file, or
- Use the generated DMG, or
- Copy to `/Applications`

---
**Last Updated**: April 11, 2026
