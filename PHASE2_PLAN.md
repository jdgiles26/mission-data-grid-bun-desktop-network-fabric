# Mission Data Grid - Phase 2: Core UI Components & First 3 Capabilities

**Status**: Ready to Begin

This phase focuses on building reusable UI components and implementing the first 3 core capabilities that form the foundation for all others.

## Phase Overview

**Duration**: ~40 hours
**Start**: After Phase 1 completion
**Deliverables**: 
- Reusable component library (30+ components)
- First 3 capabilities fully functional
- Integrated dashboard with real data
- >60% test coverage for Phase 2 code

## What We're Building

### Priority Order (Data-Driven)

1. **Capability 1 - Real-Time Network Topology Visualization** (12 hours)
   - D3.js-based visualization
   - Node health indicators
   - Link bandwidth visualization
   - Real-time updates
   
2. **Capability 4 - Mission Health & Performance Dashboard** (10 hours)
   - Health overview cards
   - Component status grid
   - Performance metrics
   - Real-time alerts
   
3. **Capability 3 - Packet Intelligence & Security Analytics** (10 hours)
   - Flow table with filtering
   - Protocol breakdown
   - Anomaly alerts
   - Security events

These 3 form the foundation. Others depend on them.

## Component Library (Phase 2a: 8 hours)

### Core Components

#### Layout Components
- `<Container>` - Centered content wrapper
- `<Grid>` - Responsive grid layout
- `<Stack>` - Flexbox vertical/horizontal stack
- `<Spacer>` - Size control component

#### Display Components
- `<Card>` - Elevated container
- `<Badge>` - Status/category indicator
- `<Alert>` - Dismissible alert box
- `<Skeleton>` - Loading placeholder
- `<EmptyState>` - Fallback when no data
- `<Spinner>` - Loading indicator

#### Form Components
- `<Input>` - Text input with validation
- `<Select>` - Dropdown select
- `<Checkbox>` - Single checkbox
- `<Radio>` - Radio button group
- `<Switch>` - Toggle switch
- `<Button>` - Clickable button (variants: primary, secondary, danger)
- `<FormGroup>` - Label + input wrapper

#### Data Display
- `<Table>` - Sortable, filterable table
- `<Tabs>` - Tab panel component
- `<StatusBadge>` - Health status indicator
- `<MetricCard>` - KPI display card

#### Feedback
- `<Toast>` - Notification toast
- `<Modal>` - Dialog modal
- `<Tooltip>` - Hover tooltip
- `<ProgressBar>` - Linear progress

#### Visualization
- `<TopologyVisualization>` - D3.js topology graph
- `<TimeSeriesChart>` - Line/area chart
- `<BarChart>` - Bar chart
- `<Gauge>` - Circular gauge

**File Structure**:
```
src/shared/components/
├── layout/
│   ├── Container.tsx
│   ├── Grid.tsx
│   ├── Stack.tsx
│   └── Spacer.tsx
├── display/
│   ├── Card.tsx
│   ├── Badge.tsx
│   ├── Alert.tsx
│   ├── Skeleton.tsx
│   ├── EmptyState.tsx
│   └── Spinner.tsx
├── forms/
│   ├── Input.tsx
│   ├── Select.tsx
│   ├── Checkbox.tsx
│   ├── Radio.tsx
│   ├── Switch.tsx
│   ├── Button.tsx
│   └── FormGroup.tsx
├── data/
│   ├── Table.tsx
│   ├── Tabs.tsx
│   ├── StatusBadge.tsx
│   └── MetricCard.tsx
├── feedback/
│   ├── Toast.tsx
│   ├── Modal.tsx
│   ├── Tooltip.tsx
│   └── ProgressBar.tsx
├── visualization/
│   ├── TopologyVisualization.tsx
│   ├── TimeSeriesChart.tsx
│   ├── BarChart.tsx
│   └── Gauge.tsx
└── index.ts (exports)
```

## Capability 1: Real-Time Network Topology Visualization (12 hours)

### Backend Work (3 hours)

**RPC Endpoints** to add in `index.ts`:
```typescript
mainWindowRPC.request("getTopologyData", () => Promise<{
  nodes: Array<{
    id: string;
    label: string;
    type: "kit" | "device" | "service";
    health: "ok" | "warning" | "error";
    metrics: { cpu?: number; memory?: number; latency?: number };
  }>;
  links: Array<{
    source: string;
    target: string;
    bandwidth: number;
    latency: number;
    packetLoss: number;
  }>;
  metadata: { lastUpdate: number; totalNodes: number; totalLinks: number };
}>);

mainWindowRPC.request("subscribeTopologyUpdates", () => Promise<{
  unsubscribe: () => void;
  // Emits updates via event stream
}>);

mainWindowRPC.request("getNodeDetails", (nodeId: string) => Promise<{
  id: string;
  label: string;
  type: string;
  config: Record<string, any>;
  metrics: Record<string, number>;
  events: Array<{ timestamp: number; event: string; severity: string }>;
}>);
```

**Backend Data Sources**:
- Use existing `MeshTopologyEngine` for topology data
- Query `AutonetKitBuilder` for kit/device list
- Get real-time metrics from health engine
- Calculate link bandwidth from packet capture

### Frontend Work (9 hours)

#### 1. Topology Component (`src/views/dashboard/components/TopologyVisualization.tsx`) - 4 hours
```typescript
interface TopologyProps {
  nodes: Node[];
  links: Link[];
  onNodeClick?: (nodeId: string) => void;
  onLinkClick?: (link: Link) => void;
  height?: number;
  showLabels?: boolean;
  showMetrics?: boolean;
}

export const TopologyVisualization: React.FC<TopologyProps> = ({ ... }) => {
  // D3.js implementation
  // - Force-directed graph layout
  // - Node color based on health
  // - Link thickness based on bandwidth
  // - Zoom/pan support
  // - Real-time force re-simulation
  // - Legend
  // - Tooltip on hover
}
```

#### 2. Node Details Panel (`src/views/dashboard/components/NodeDetailsPanel.tsx`) - 2 hours
```typescript
interface NodeDetailsPanelProps {
  nodeId: string;
  onClose: () => void;
}

export const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({ ... }) => {
  // Shows when node clicked
  // - Node metrics (CPU, memory, latency)
  // - Recent events
  // - Configuration
  // - Action buttons (reboot, logs, etc.)
}
```

#### 3. Topology View (`src/views/topology/index.tsx`) - 3 hours
```typescript
// Main topology view component
// - Full-screen topology
// - Sidebar with node list
// - Filter/search
// - Real-time subscription
// - Legend
// - Export functionality
```

### Database Schema (in existing DB)

```sql
-- Extend existing tables or create new ones
CREATE TABLE topology_nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT, -- kit, device, service
  health TEXT, -- ok, warning, error
  last_seen DATETIME,
  config JSON
);

CREATE TABLE topology_links (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  target_id TEXT,
  bandwidth_mbps REAL,
  latency_ms REAL,
  packet_loss_percent REAL,
  last_update DATETIME
);

CREATE TABLE topology_events (
  id TEXT PRIMARY KEY,
  node_id TEXT,
  timestamp DATETIME,
  event_type TEXT,
  severity TEXT, -- info, warning, error
  details TEXT,
  FOREIGN KEY (node_id) REFERENCES topology_nodes(id)
);
```

### Integration Points

1. **Zustand Store**: Store topology data + selected node
2. **RPC Client**: Fetch topology data on load + subscribe to updates
3. **ErrorBoundary**: Graceful handling if topology fails
4. **Real-time Updates**: Websocket/IPC event streaming

## Capability 4: Mission Health & Performance Dashboard (10 hours)

### Backend Work (2 hours)

**RPC Endpoints**:
```typescript
mainWindowRPC.request("getHealthMetrics", () => Promise<{
  overall: "healthy" | "degraded" | "failed";
  components: Record<string, {
    status: "ok" | "warning" | "error";
    message: string;
    lastCheck: number;
  }>;
  kits: Array<{
    id: string;
    name: string;
    health: string;
    devices: { healthy: number; degraded: number; failed: number };
    uptime: number;
  }>;
  metrics: {
    avgLatency: number;
    packetLoss: number;
    throughput: number;
    errorRate: number;
  };
}>);

mainWindowRPC.request("getPerformanceTimeSeries", (hours: number = 24) => Promise<{
  timestamps: number[];
  latency: number[];
  throughput: number[];
  errorRate: number[];
  cpu: number[];
  memory: number[];
}>);
```

### Frontend Work (8 hours)

#### 1. Health Overview (`src/views/dashboard/components/HealthOverview.tsx`) - 2 hours
```typescript
// Grid of component status cards
// - Each component (AutoNet, Packet Capture, Topology, etc.)
// - Status indicator
// - Last check time
// - Quick action buttons
```

#### 2. KPI Cards (`src/views/dashboard/components/KPICards.tsx`) - 1 hour
```typescript
// 4 metric cards
// - Latency (ms)
// - Throughput (Mbps)
// - Packet Loss (%)
// - Error Rate (%)
```

#### 3. Performance Chart (`src/views/dashboard/components/PerformanceChart.tsx`) - 2 hours
```typescript
// Line chart showing 24-hour metrics
// - Multiple lines (latency, throughput, errors)
// - Legend
// - Zoom capability
// - Hover tooltip
```

#### 4. Alerts Panel (`src/views/dashboard/components/AlertsPanel.tsx`) - 2 hours
```typescript
// Recent alerts/issues
// - Severity indicators
// - Action buttons
// - Alert filtering
// - Clear actions
```

#### 5. Dashboard Integration (`src/views/dashboard/index.tsx`) - 1 hour
```typescript
// Main dashboard layout combining:
// - Topology visualization (top)
// - KPI cards (middle)
// - Alerts panel (bottom-left)
// - Performance chart (bottom-right)
```

## Capability 3: Packet Intelligence & Security Analytics (10 hours)

### Backend Work (3 hours)

**RPC Endpoints**:
```typescript
mainWindowRPC.request("getPacketFlows", () => Promise<{
  flows: Array<{
    id: string;
    sourceIp: string;
    sourcePort: number;
    destIp: string;
    destPort: number;
    protocol: string;
    packetCount: number;
    byteCount: number;
    duration: number;
    anomalies: string[];
  }>;
  totalFlows: number;
  lastUpdate: number;
}>);

mainWindowRPC.request("getSecurityEvents", () => Promise<{
  events: Array<{
    id: string;
    timestamp: number;
    eventType: string; // scan, ddos, weakness, etc
    severity: string;
    description: string;
    sourceIp: string;
    destIp: string;
    flowId?: string;
  }>;
  totalEvents: number;
}>);

mainWindowRPC.request("getProtocolBreakdown", () => Promise<{
  protocols: Array<{
    protocol: string;
    packetCount: number;
    byteCount: number;
    percentage: number;
  }>;
}>);
```

### Frontend Work (7 hours)

#### 1. Flows Table (`src/views/packet-capture/components/FlowsTable.tsx`) - 3 hours
```typescript
// Detailed table of packet flows
// - Sortable columns (all)
// - Filterable (protocol, IP, port)
// - Clickable rows for details
// - Anomaly indicators
// - Real-time updates
```

#### 2. Security Events (`src/views/packet-capture/components/SecurityEvents.tsx`) - 2 hours
```typescript
// Timeline/list of security events
// - Severity colors
// - Event details on click
// - Filtering by type/severity
// - Auto-refresh
```

#### 3. Protocol Breakdown (`src/views/packet-capture/components/ProtocolBreakdown.tsx`) - 1 hour
```typescript
// Pie/donut chart
// - Protocol distribution
// - Tooltip with details
// - Click to filter flows
```

#### 4. Packet View (`src/views/packet-capture/index.tsx`) - 1 hour
```typescript
// Main packet capture view
// - Tab navigation (flows, events, protocols)
// - Combined layout
```

## Implementation Timeline

### Week 1 (Days 1-4)
- **Day 1**: Build component library (8 hours)
- **Day 2-3**: Implement Capability 1 (12 hours)
- **Day 4**: Testing & integration (4 hours)

### Week 2 (Days 5-8)
- **Day 5-6**: Implement Capability 4 (10 hours)
- **Day 7**: Implement Capability 3 (10 hours)
- **Day 8**: Testing, bug fixes, documentation (6 hours)

## Success Criteria

✅ All 30+ components built and tested
✅ Capabilities 1, 3, 4 fully functional
✅ Real data flows from backend to frontend
✅ Real-time updates working
✅ >60% test coverage for Phase 2 code
✅ No console errors or warnings
✅ Dark/light theme works for all components
✅ Responsive on mobile/tablet/desktop
✅ <500ms load time for each capability
✅ Dashboard shows real metrics

## Testing Strategy

### Unit Tests
- Component rendering tests
- Store interaction tests
- RPC call mocking

### Integration Tests
- Component + store integration
- RPC call + store update
- Real-time update simulation

### E2E Tests
- Full user flows
- Data persistence
- Theme switching

## Dependencies & Tools

**Already Installed** (from Phase 1):
- React 18.3.1
- D3.js 7.9.0
- Zustand 5.0.12
- Tailwind CSS 3.4.19
- Vitest 1.6.1
- React Testing Library 14.3.1

**New Tools**:
- `recharts` (optional, for charts if D3 too heavy)

## File Statistics (Phase 2)

- Component library: ~100 files, ~3000 lines
- Capability 1: ~12 files, ~1500 lines
- Capability 4: ~8 files, ~1000 lines
- Capability 3: ~8 files, ~1000 lines
- Tests: ~40 files, ~2000 lines
- **Total**: ~68 files, ~7500 lines

## Next Phase Preview

Phase 3 will implement remaining 7 capabilities:
- Deployment & Orchestration
- Config Management
- Data Collection & Logging
- AI/ML Intelligence
- Emergency Procedures
- Identity & Zero-Trust
- Coalition Data Fabric

---

**Last Updated**: April 21, 2026
**Status**: Ready to Start
**Prerequisite**: Phase 1 Complete ✅
