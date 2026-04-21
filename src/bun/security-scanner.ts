import type { NetworkDevice } from "../shared/types";

export interface SecurityFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  title: string;
  detail: string;
  device?: string;
  recommendation: string;
}

export interface SecurityScanResult {
  timestamp: Date;
  scanDurationMs: number;
  devicesScanned: number;
  findings: SecurityFinding[];
  riskScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

export class SecurityScanner {
  async scanDevices(devices: NetworkDevice[]): Promise<SecurityScanResult> {
    const start = Date.now();
    const findings: SecurityFinding[] = [];

    // Analyze each device
    for (const device of devices) {
      findings.push(...this.analyzeDevice(device));
    }

    // Analyze topology-level security
    findings.push(...this.analyzeTopology(devices));

    // Port scan reachable devices
    const reachable = devices.filter((d) => d.status !== "UNREACHABLE");
    for (const device of reachable.slice(0, 5)) {
      const portFindings = await this.quickPortCheck(device);
      findings.push(...portFindings);
    }

    const riskScore = this.calculateRiskScore(findings);
    const grade = this.riskToGrade(riskScore);

    return {
      timestamp: new Date(),
      scanDurationMs: Date.now() - start,
      devicesScanned: devices.length,
      findings: findings.sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity)),
      riskScore,
      grade,
    };
  }

  async quickScanDevice(device: NetworkDevice): Promise<SecurityFinding[]> {
    const findings = this.analyzeDevice(device);
    const portFindings = await this.quickPortCheck(device);
    return [...findings, ...portFindings];
  }

  private analyzeDevice(device: NetworkDevice): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    if (device.status === "UNREACHABLE") {
      findings.push({
        severity: "HIGH",
        category: "Availability",
        title: "Device unreachable",
        detail: `${device.hostname} (${device.ip}) cannot be reached for monitoring`,
        device: device.id,
        recommendation: "Verify network connectivity and device power status",
      });
    }

    if (device.metrics.cpu > 90) {
      findings.push({
        severity: "MEDIUM",
        category: "Resource Exhaustion",
        title: "Critical CPU utilization",
        detail: `${device.hostname} CPU at ${device.metrics.cpu}% - potential denial of service`,
        device: device.id,
        recommendation: "Investigate high CPU processes and consider load balancing",
      });
    }

    if (device.metrics.memory > 90) {
      findings.push({
        severity: "MEDIUM",
        category: "Resource Exhaustion",
        title: "Critical memory utilization",
        detail: `${device.hostname} memory at ${device.metrics.memory}%`,
        device: device.id,
        recommendation: "Check for memory leaks and consider resource scaling",
      });
    }

    if (device.metrics.interfacesDown > 0 && device.role === "EDGE") {
      findings.push({
        severity: "MEDIUM",
        category: "Network",
        title: "Edge gateway interface down",
        detail: `${device.hostname} has ${device.metrics.interfacesDown} interface(s) down`,
        device: device.id,
        recommendation: "Check physical connections and interface configuration",
      });
    }

    if (device.role === "EDGE" && device.metrics.bgpPeers === 0) {
      findings.push({
        severity: "LOW",
        category: "Routing",
        title: "No BGP peers on edge device",
        detail: `${device.hostname} has no active BGP peering sessions`,
        device: device.id,
        recommendation: "Verify BGP configuration and peer connectivity",
      });
    }

    return findings;
  }

  private analyzeTopology(devices: NetworkDevice[]): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    const firewalls = devices.filter((d) => d.role === "FIREWALL");
    if (firewalls.length === 0 && devices.length > 3) {
      findings.push({
        severity: "HIGH",
        category: "Architecture",
        title: "No dedicated firewall in topology",
        detail: "Network has no dedicated firewall devices. Traffic filtering relies on host-based rules.",
        recommendation: "Deploy dedicated firewall appliance or verify host-based firewall configurations",
      });
    }

    const coreDevices = devices.filter((d) => d.role === "CORE");
    const unreachableCores = coreDevices.filter((d) => d.status === "UNREACHABLE");
    if (unreachableCores.length > 0) {
      findings.push({
        severity: "CRITICAL",
        category: "Infrastructure",
        title: "Core infrastructure unreachable",
        detail: `${unreachableCores.length}/${coreDevices.length} core device(s) unreachable`,
        recommendation: "Immediate investigation required - core infrastructure failure",
      });
    }

    const edgeDevices = devices.filter((d) => d.role === "EDGE");
    const unreachableEdges = edgeDevices.filter((d) => d.status === "UNREACHABLE");
    if (unreachableEdges.length > edgeDevices.length / 2 && edgeDevices.length > 0) {
      findings.push({
        severity: "CRITICAL",
        category: "Perimeter",
        title: "Majority of edge gateways unreachable",
        detail: `${unreachableEdges.length}/${edgeDevices.length} edge devices down`,
        recommendation: "Check WAN connectivity and WireGuard tunnel configurations",
      });
    }

    return findings;
  }

  private async quickPortCheck(device: NetworkDevice): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const commonPorts = [22, 80, 443, 8080, 8443];

    for (const port of commonPorts) {
      try {
        const proc = Bun.spawn(
          ["nc", "-z", "-w", "1", device.ip, String(port)],
          { stdout: "pipe", stderr: "pipe" },
        );
        await proc.exited;

        if (proc.exitCode === 0) {
          // Port is open
          if (port === 80 && device.role !== "EDGE") {
            findings.push({
              severity: "LOW",
              category: "Services",
              title: `HTTP port open on ${device.hostname}`,
              detail: `Port 80 open on ${device.ip} - unencrypted HTTP service detected`,
              device: device.id,
              recommendation: "Consider using HTTPS (443) instead of plain HTTP",
            });
          }
          if (port === 8080 || port === 8443) {
            findings.push({
              severity: "INFO",
              category: "Services",
              title: `Management port ${port} open on ${device.hostname}`,
              detail: `Port ${port} is accessible on ${device.ip}`,
              device: device.id,
              recommendation: "Ensure management interfaces are properly access-controlled",
            });
          }
        }
      } catch {
        // Port check failed, skip
      }
    }

    return findings;
  }

  private calculateRiskScore(findings: SecurityFinding[]): number {
    let score = 100;
    for (const f of findings) {
      switch (f.severity) {
        case "CRITICAL": score -= 25; break;
        case "HIGH": score -= 15; break;
        case "MEDIUM": score -= 8; break;
        case "LOW": score -= 3; break;
        case "INFO": score -= 1; break;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  private riskToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 90) return "A";
    if (score >= 75) return "B";
    if (score >= 60) return "C";
    if (score >= 40) return "D";
    return "F";
  }

  private severityWeight(s: SecurityFinding["severity"]): number {
    const weights = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
    return weights[s];
  }
}
