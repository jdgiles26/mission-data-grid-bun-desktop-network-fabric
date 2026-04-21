# Phase 2: Packet-Capture Ingestion & Deep Protocol Decode

## Overview

Phase 2 introduces true packet-level visibility to the Mission Data Grid's Universal Intelligence mode. Moving beyond socket-table sampling, this phase implements:

- **Real packet capture** via tcpdump/libpcap integration
- **Deep packet inspection** across L2-L7 protocol stack
- **Flow tracking** with packet-level granularity
- **Protocol analysis** for HTTP, DNS, TLS/SSL
- **Anomaly detection** based on packet behavior

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Packet Intelligence Pipeline                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   tcpdump       │───▶│  Packet Parser  │───▶│  Flow Tracker   │          │
│  │   (libpcap)     │    │  (L2-L7 Decode) │    │  (5-tuple keys) │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│           │                      │                      │                   │
│           │                      ▼                      ▼                   │
│           │             ┌─────────────────┐    ┌─────────────────┐          │
│           │             │ Protocol        │    │ Anomaly         │          │
│           │             │ Decoders        │    │ Detection       │          │
│           │             │ (HTTP/DNS/TLS)  │    │ Engine          │          │
│           │             └─────────────────┘    └─────────────────┘          │
│           │                      │                      │                   │
│           ▼                      ▼                      ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    Packet Database Layer                         │        │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │        │
│  │  │   Flows     │ │    DNS      │ │    HTTP     │ │   TLS     │ │        │
│  │  │   Table     │ │   Queries   │ │ Transactions│ │ Handshakes│ │        │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    Telemetry Events                              │        │
│  │         (Integrated with existing Universal Telemetry)           │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## New Components

### 1. Packet Capture Engine (`src/bun/packet-capture.ts`)

The core packet capture implementation using tcpdump as the backend.

**Key Features:**
- Cross-platform compatibility (uses system tcpdump)
- Live packet capture from any network interface
- BPF filter support for targeted capture
- PCAP format parsing

**Classes:**
- `PacketCaptureEngine` - Main capture orchestration
- Protocol parsers for Ethernet, IP, TCP, UDP, ICMP, SCTP
- L7 detectors for HTTP, DNS, TLS, SSH, etc.

### 2. Packet Database (`src/bun/packet-database.ts`)

Extended database schema for packet-level data persistence.

**New Tables:**
- `capture_sessions` - Active/past capture sessions
- `packet_flows` - Flow records with 5-tuple keys
- `packet_events` - Packet-level events and anomalies
- `dns_queries` - DNS query/response tracking
- `http_transactions` - HTTP request/response pairs
- `tls_handshakes` - TLS handshake details and fingerprints

### 3. Packet Intelligence Engine (`src/bun/packet-intelligence.ts`)

High-level orchestration layer integrating capture, analysis, and storage.

**Key Features:**
- Configuration-driven capture modes (passive/active/targeted)
- Real-time anomaly detection
- Protocol statistics aggregation
- Alert generation for security/performance issues

**Capture Modes:**
- `passive` - Monitor only, no database storage
- `active` - Full capture with flow tracking
- `targeted` - BPF-filtered capture for specific traffic

## Protocol Decoding

### L2 - Data Link Layer
- Ethernet II framing
- VLAN tagging (802.1Q, 802.1AD)
- MAC address parsing

### L3 - Network Layer
- IPv4 header parsing (options, flags, fragmentation)
- IPv6 header parsing (extension headers, flow labels)
- ARP request/reply parsing
- ICMPv4/ICMPv6 message parsing

### L4 - Transport Layer
- TCP (flags, options, sequence numbers, SACK, timestamps)
- UDP (ports, length, checksum)
- SCTP (chunks, verification tags)

### L7 - Application Layer
- **HTTP**: Request/response parsing, header extraction, keep-alive tracking
- **DNS**: Query/response matching, record type detection, latency tracking
- **TLS**: Handshake parsing, SNI extraction, cipher suite detection, JA3 fingerprints

## Usage Examples

### Basic Capture
```typescript
import { createPacketIntelligenceEngine } from "./packet-intelligence";

const engine = createPacketIntelligenceEngine(db);
const result = await engine.startCapture({
  targetInterface: "en0",
  captureMode: "active"
});
```

### Get Snapshot
```typescript
const snapshot = engine.getSnapshot();
console.log(`Captured ${snapshot.packetsCaptured} packets`);
console.log(`Tracking ${snapshot.flowsTracked} flows`);
```

### List Flows
```typescript
const flows = engine.listFlows(10);
for (const flow of flows) {
  console.log(`${flow.key.sourceIP}:${flow.key.sourcePort} → ${flow.key.destinationIP}:${flow.key.destinationPort}`);
}
```

### DNS Queries
```typescript
const queries = engine.getDNSQueries(20);
for (const q of queries) {
  console.log(`${q.queryName} (${q.queryTypeName})`);
}
```

---

**Phase 2 Status**: Implemented  
**Last Updated**: April 11, 2026
