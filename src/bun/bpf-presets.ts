// BPF Filter Presets for common capture scenarios

export interface BPFPreset {
  name: string;
  description: string;
  filter: string;
  category: "common" | "security" | "performance" | "protocol";
}

export const BPF_PRESETS: BPFPreset[] = [
  {
    name: "HTTP/HTTPS Traffic",
    description: "Capture web traffic only",
    filter: "tcp port 80 or tcp port 443",
    category: "common",
  },
  {
    name: "DNS Queries",
    description: "Capture DNS resolution traffic",
    filter: "udp port 53",
    category: "common",
  },
  {
    name: "SSH Traffic",
    description: "Capture SSH connections",
    filter: "tcp port 22",
    category: "common",
  },
  {
    name: "Mail Traffic",
    description: "SMTP, POP3, IMAP",
    filter: "tcp port 25 or tcp port 110 or tcp port 143 or tcp port 587",
    category: "common",
  },
  {
    name: "ICMP Only",
    description: "Ping and ICMP errors",
    filter: "icmp or icmp6",
    category: "protocol",
  },
  {
    name: "No Local Traffic",
    description: "Exclude loopback and RFC1918",
    filter: "not (src net 127.0.0.0/8 or dst net 127.0.0.0/8 or src net 10.0.0.0/8 or dst net 10.0.0.0/8 or src net 192.168.0.0/16 or dst net 192.168.0.0/16 or src net 172.16.0.0/12 or dst net 172.16.0.0/12)",
    category: "common",
  },
  {
    name: "Suspicious Ports",
    description: "Common malware/botnet ports",
    filter: "tcp port 4444 or tcp port 5555 or tcp port 6666 or tcp port 31337 or tcp port 12345",
    category: "security",
  },
  {
    name: "Large Packets",
    description: "Packets larger than MTU",
    filter: "greater 1500",
    category: "performance",
  },
  {
    name: "TCP SYN Only",
    description: "Connection initiations",
    filter: "tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0",
    category: "security",
  },
  {
    name: "TCP RST Only",
    description: "Connection resets",
    filter: "tcp[tcpflags] & tcp-rst != 0",
    category: "performance",
  },
  {
    name: "Multicast",
    description: "Multicast traffic",
    filter: "multicast",
    category: "protocol",
  },
  {
    name: "Broadcast",
    description: "Broadcast traffic",
    filter: "broadcast",
    category: "protocol",
  },
  {
    name: "IPv6 Only",
    description: "IPv6 traffic only",
    filter: "ip6",
    category: "protocol",
  },
  {
    name: "ARP Traffic",
    description: "Address resolution",
    filter: "arp",
    category: "protocol",
  },
];

export function getBPFPresetsByCategory(category: BPFPreset["category"]): BPFPreset[] {
  return BPF_PRESETS.filter((p) => p.category === category);
}

export function getAllBPFPresets(): BPFPreset[] {
  return [...BPF_PRESETS];
}

export function validateBPFFilter(filter: string): { valid: boolean; error?: string } {
  // Basic validation - check for common syntax errors
  if (!filter.trim()) {
    return { valid: true };
  }

  // Check for unbalanced parentheses
  const openParens = (filter.match(/\(/g) || []).length;
  const closeParens = (filter.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    return { valid: false, error: "Unbalanced parentheses" };
  }

  // Check for unbalanced quotes
  const quotes = (filter.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    return { valid: false, error: "Unbalanced quotes" };
  }

  return { valid: true };
}

export function formatBPFFilter(filter: string): string {
  // Remove extra whitespace
  return filter.replace(/\s+/g, " ").trim();
}
