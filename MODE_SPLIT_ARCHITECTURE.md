# Mission Data Grid Mode Split Architecture (Phase 1 + Phase 2)

## Objective
Enforce a hard operational split between:
- `AUTONET_ASSIST`: mission kit/device topology, AutoNet validation, mission record workflows.
- `UNIVERSAL_INTEL`: local connected-network telemetry, anomaly/alert/flow stream, universal event inspection.

## Repository Map

### Phase 2 Additions (Packet Capture)

#### `src/bun/packet-capture.ts`
- Core packet capture engine using tcpdump/libpcap
- L2-L7 protocol parsing (Ethernet, IP, TCP, UDP, ICMP, DNS, HTTP, TLS)
- Flow tracking with 5-tuple keys
- Real-time packet event emission

#### `src/bun/packet-database.ts`
- Database schema for packet capture data
- Tables: capture_sessions, packet_flows, packet_events, dns_queries, http_transactions, tls_handshakes
- Flow correlation and query APIs

#### `src/bun/packet-intelligence.ts`
- High-level packet intelligence orchestration
- Anomaly detection (port scans, high retransmits, protocol mismatches)
- Real-time telemetry event generation
- L7 protocol analysis (DNS, HTTP, TLS)

#### `src/bun/packet-capture-service.ts`
- Service wrapper for capture lifecycle management
- Real-time metrics streaming
- Event subscription management

#### `src/bun/packet-capture-manager.ts`
- Unified manager combining capture, streaming, and analysis
- State management for UI integration

#### `src/bun/packet-analyzer.ts`
- Advanced traffic analysis
- Pattern detection (bursty, steady, spikey)
- Security insights (scan detection, weak TLS)
- Performance analysis

#### `src/bun/packet-event-stream.ts`
- Real-time event streaming to UI
- Event buffering and batching
- Client subscription management

#### `src/bun/enhanced-network-intelligence.ts`
- Integration layer between Phase 1 (socket) and Phase 2 (packet)
- Graceful fallback when capture unavailable
- Unified telemetry event stream

#### `src/views/packet-capture/`
- New UI view for packet capture visualization
- Real-time flow, DNS, HTTP, TLS tables
- Capture controls and metrics display
- Event log viewer

## Runtime Data Boundaries

### AutoNet Assist
- Mission kit topology and device monitoring
- No packet capture data

### Universal Intelligence
- Phase 1: Socket table sampling (netstat)
- Phase 2: Real packet capture with deep inspection
- Hybrid mode: Combines both sources

## Packet Capture Features

### Capture Modes
- `passive`: Monitor only
- `active`: Full capture with database storage
- `targeted`: BPF-filtered capture

### Protocol Support
- L2: Ethernet II, VLAN (802.1Q/802.1AD)
- L3: IPv4, IPv6, ARP, ICMP
- L4: TCP (full options), UDP, SCTP
- L7: HTTP/HTTPS, DNS, TLS/SSL (with JA3 fingerprints)

### Real-time Telemetry
- Per-packet events (no aggregation/synthesis)
- Flow start/update/end lifecycle
- DNS query/response tracking
- HTTP transaction reconstruction
- TLS handshake analysis
- Anomaly alerts

### Security Detection
- Port scan detection (SYN patterns)
- High retransmission rates
- Protocol mismatches
- Weak TLS versions
- Oversized packets

## Database Schema

### capture_sessions
- id, interface_name, config, started_at, ended_at
- status, total_packets, total_bytes, unique_flows

### packet_flows
- id, session_id, protocol, source_ip, source_port
- destination_ip, destination_port, l2/l3/l4/l7_protocols
- packet_count, byte_count, tcp_state, timing info

### dns_queries
- id, session_id, timestamp, query_name, query_type
- source/destination IPs, latency_ms, response data

### http_transactions
- id, session_id, method, url, host, status_code
- request/response timing, headers

### tls_handshakes
- id, session_id, handshake_type, tls_version
- sni, cipher_suites, ja3 fingerprints

## Integration Points

### RPC Handlers (index.ts)
- getPacketCaptureStatus
- startPacketCapture
- stopPacketCapture
- getPacketFlows
- getPacketDNSQueries
- getPacketHTTPTransactions
- getPacketTLSHandshakes
- getCaptureInterfaces

### Event Streaming
- Real-time events via subscription
- Buffered for UI performance
- Automatic reconnection

## Performance Considerations

- Packet parsing: ~100k pps on modern hardware
- Flow table: 10k active flows max
- Event buffer: 1k events max
- Database: Async writes, indexed queries
- BPF filtering: Kernel-level for efficiency

## Security & Privacy

- Requires root/admin for capture
- No payload content stored
- DNS queries: names only, no response data
- HTTP: headers only, no body content
- Auto-pruning after 30 days

---
**Last Updated**: April 11, 2026
