# Mission Data Grid - Launch Instructions

## Build Status
✅ Application builds successfully
✅ All views render correctly (Dashboard, Data Grid, Topology, Settings)
✅ No JavaScript errors
✅ Window opens at 1400x900 resolution

## How to Launch

### Option 1: Open via Finder
Double-click:
```
build/dev-macos-arm64/Mission Data Grid-dev.app
```

### Option 2: Command Line
```bash
cd apps/mission-data-grid
open "build/dev-macos-arm64/Mission Data Grid-dev.app"
```

### Option 3: Direct Launch (with console output)
```bash
cd apps/mission-data-grid
"build/dev-macos-arm64/Mission Data Grid-dev.app/Contents/MacOS/launcher"
```

## What You Should See

1. **Window opens** with title "Mission Data Grid"
2. **Dashboard view** loads with:
   - Left sidebar with navigation (Dashboard, Data Grid, Topology, Settings)
   - Mesh status panel showing "FULL" (green)
   - Stats cards (Network Devices, Pending Records, etc.)
   - Mission Kits table
   - Network Devices grid
3. **Navigation works** - Click sidebar items to switch views

## Troubleshooting

If the app doesn't open:
1. Check macOS Security & Privacy settings - may need to allow the app
2. Right-click the app and select "Open" to bypass Gatekeeper
3. Check Console app for any crash logs

## Rebuild if Needed

```bash
cd apps/mission-data-grid
rm -rf build
npm run build
```
