# Mission Data Grid - User Guide

## Getting Started

Mission Data Grid is a production-grade desktop application for real-time network operations, health monitoring, and mission-critical decision support. This guide covers all key features and workflows.

### System Requirements
- macOS 10.15+ (Intel/Apple Silicon), Ubuntu 20.04+, or Windows 10+
- 4GB RAM minimum (8GB recommended)
- 500MB free disk space
- Stable internet connection

### Launching the Application

**macOS**:
```bash
open /Applications/mission-data-grid.app
```

**Linux**:
```bash
./mission-data-grid-1.0.0.AppImage
```

**Windows**:
```cmd
mission-data-grid.exe
```

### Initial Setup

1. **Connect to Backend**
   - Launch app → Settings (gear icon)
   - Enter Backend URL: `https://mission-control:3000`
   - Enter API Key (provided by administrator)
   - Click "Test Connection"
   - Status will show "✓ Connected" when successful

2. **Theme Selection**
   - Click your avatar (top-right)
   - Select "Light" or "Dark" theme
   - Theme persists across sessions

3. **Customize Sidebar**
   - Drag capabilities to reorder
   - Click "×" to hide/show views
   - Sidebar state saved automatically

## Core Views & Capabilities

### 1. Topology Viewer
**Purpose**: Visualize your entire network mesh in real-time

**What You See**:
- Nodes (devices, switches, controllers)
- Edges (connections between nodes)
- Node colors indicate status (green=healthy, yellow=warning, red=critical)
- Edge thickness shows bandwidth utilization

**Interactions**:
- **Drag** to move nodes around
- **Scroll/pinch** to zoom in/out
- **Click node** to view details
- **Hover edge** to see connection stats
- **Right-click** for context menu (configure, isolate, etc.)

**Key Metrics on Hover**:
- Latency: 45ms
- Packet loss: 0.2%
- Throughput: 850 Mbps
- Last update: 2s ago

### 2. Health Dashboard
**Purpose**: Monitor system health and receive early warnings

**Key Metrics**:
- **Overall Score** (0-100): Green≥80, Yellow 50-79, Red<50
- **KPI Cards**: CPU, Memory, Network, Disk
- **Time-Series Charts**: Historical trends (1h, 24h, 7d)
- **Alert List**: Active alerts with severity levels

**Alert Severity Levels**:
- 🔴 Critical: Immediate action required
- 🟠 Warning: Investigation recommended
- 🟡 Info: Informational alert

**Taking Action**:
1. Click alert
2. View recommended action
3. Click "Execute" to run automated response
4. View execution history below

### 3. Packet Intelligence
**Purpose**: Analyze network traffic and identify security threats

**Sections**:
- **Flow Table**: All active packet flows with bidirectional data
  - Protocol: TCP, UDP, ICMP
  - Source/Destination IPs and ports
  - Bytes sent/received
  - Click row to drill down

- **Security Findings**: Real-time threat detection
  - Port scan activity
  - Unusual traffic patterns
  - Potential DDoS attempts
  - Protocol violations

**Actions**:
- Click "Block" to add to firewall rules
- Click "Investigate" to see detailed analysis
- Click "Export" to save as CSV/JSON

### 4. AutoNet Orchestration
**Purpose**: Automate network configuration and deployment

**Workflow**:
1. **Create Playbook**
   - Click "New Playbook"
   - Add steps (configure interface, deploy policy, etc.)
   - Save as template

2. **Configure Kit**
   - Select target devices/switches
   - Review configuration changes
   - Set approval workflow if needed

3. **Execute**
   - Click "Deploy"
   - Monitor progress in real-time
   - Auto-rollback on error

4. **Review Results**
   - Check "Execution History"
   - View before/after configurations
   - Download execution report

### 5. Configuration Management
**Purpose**: Track and sync configuration across devices

**Features**:
- **Edit Config**: YAML editor with syntax highlighting
- **Detect Drift**: Compare current vs. desired state
- **Sync**: Push configuration to all devices
- **Rollback**: Revert to previous version in one click

**Workflow**:
```
Edit YAML Config
    ↓
Save Changes
    ↓
Drift Detection (auto runs)
    ↓
Shows: 3 devices have drift
    ↓
Click "Sync"
    ↓
Devices updated successfully ✓
```

### 6. Identity Management
**Purpose**: Manage Ziti identities and access policies

**Capabilities**:
- View all Ziti identities
- Create/revoke identities
- Set up access policies
- Review audit logs

### 7. Mission Logging
**Purpose**: Centralized activity and system logging

**Features**:
- Activity stream (who did what, when)
- Full-text search across all logs
- Filter by component/severity/time range
- Export logs for compliance

**Example Search**:
```
Search: "deployment failed"
Results: 2 entries found
├─ 2024-01-15 14:32 - Playbook XYZ deployment failed
└─ 2024-01-14 09:18 - Kit config deployment failed
```

### 8. AI Intelligence
**Purpose**: Anomaly detection and predictive analytics

**Sections**:
- **Anomaly Detection**: ML-identified unusual patterns
- **Forecasting**: 7-day health forecast
- **Alert Correlation**: AI-grouped related alerts
- **Root Cause Analysis**: Suggested causes for issues

### 9. Emergency Procedures
**Purpose**: Fast response to critical incidents

**Features**:
- **Runbooks**: Step-by-step incident response guides
- **Failover**: Automated failover to backup systems
- **Recovery**: Guided recovery procedures
- **Execution Tracking**: Who ran what, when, results

### 10. Coalition Data Fabric
**Purpose**: Integrate data from multiple sources

**Features**:
- Schema mapping (source ↔ target)
- Data transformation rules
- Validation and error handling
- Audit trail of all data movements

## Common Tasks

### Task 1: Search for a Device
```
Keyboard shortcut: Cmd+K (macOS) or Ctrl+K (Windows/Linux)
Type: "core-switch-1"
Results show in dropdown
Click result to navigate
```

### Task 2: Export Data
```
In any data view (Topology, Health, Packets):
1. Select rows (click checkboxes or Cmd+A for all)
2. Click "Export" button
3. Choose format (CSV, JSON, Excel, PDF)
4. Click "Download"
```

### Task 3: Create Custom Alert
```
Health Dashboard → Click "+" in Alerts section
Name: "CPU > 90%"
Condition: CPU usage exceeds 90% for 5 minutes
Action: Send notification + Execute playbook "reduce-load"
Click "Save"
```

### Task 4: Run Emergency Failover
```
Emergency Procedures → Select "Primary to Backup Failover"
Review: 12 nodes will failover
Estimated downtime: 30 seconds
Click "Execute"
Progress: [████████░░] 80%
Status: ✓ Failover complete
```

### Task 5: View Connection Details
```
Topology → Click any node
Details panel shows:
├─ Status: Healthy
├─ Uptime: 24d 5h
├─ IP Address: 192.168.1.10
├─ Role: Core Switch
├─ Connections: 8 active
└─ Last Updated: 2s ago
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K / Ctrl+K | Open search |
| Cmd+, / Ctrl+, | Settings |
| Cmd+H / Ctrl+H | Hide sidebar |
| Cmd+Shift+D / Ctrl+Shift+D | Dark mode toggle |
| Cmd+L / Ctrl+L | Open logs |
| Cmd+E / Ctrl+E | Export data |
| ? | Keyboard shortcuts help |

## Troubleshooting

### App won't launch
```
Solution:
1. Check system requirements
2. Clear cache: rm -rf ~/.mission-data-grid
3. Restart computer
4. Reinstall application
```

### Backend connection fails
```
Solution:
1. Verify backend is running
2. Check network connection
3. Verify API key is correct
4. Check firewall allows port 3000
5. Try: Settings → Test Connection
```

### Performance issues / High memory
```
Solution:
1. Reduce data retention: Settings → Data → Archive old data
2. Disable real-time polling: Settings → Performance
3. Restart application
4. Check system resources (Activity Monitor/Task Manager)
```

### Data not updating
```
Solution:
1. Check WebSocket connection: Settings → Connection Status
2. Verify backend connection: Settings → Test Connection
3. Manually refresh: Cmd+R
4. Check network latency
5. Review application logs
```

## Getting Help

- **In-App Help**: Press `?` to open keyboard shortcuts
- **Knowledge Base**: https://docs.mission-control.io
- **Support Email**: support@mission-control.io
- **Bug Reports**: https://github.com/mission-control/mission-data-grid/issues

## Tips & Tricks

1. **Pin Important Alerts**: Right-click alert → "Pin to Top"
2. **Save Searches**: Packet Intelligence → Filter → Save as "High Traffic"
3. **Use Keyboard Shortcuts**: Cmd+K is faster than clicking around
4. **Export Daily Reports**: Schedule exports via Automation rules
5. **Dark Mode at Night**: Theme switches automatically if enabled

## Next Steps

Now that you're familiar with the basics:
1. Explore each capability view
2. Set up your first playbook
3. Create custom alerts
4. Try an export workflow
5. Read the Advanced Guide for power-user features

---

**Last Updated**: 2024-01-20 | **Version**: 1.0.0
