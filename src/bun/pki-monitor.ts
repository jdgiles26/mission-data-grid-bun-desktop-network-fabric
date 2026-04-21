// PKI Monitor
// Tracks certificate expiration across the AutoNet PKI hierarchy

import { existsSync, readFileSync, statSync, readdirSync } from "fs";
import { join } from "path";

export interface CertRecord {
  id: string;
  filePath: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  daysUntilExpiry: number;
  status: "valid" | "expiring-soon" | "expired";
  type: "root-ca" | "intermediate-ca" | "router" | "controller" | "identity";
}

export class PkiMonitor {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async scanCertificates(): Promise<CertRecord[]> {
    const certs: CertRecord[] = [];

    // Scan files/pki directory
    const pkiDir = join(this.rootPath, "files/pki");
    if (existsSync(pkiDir)) {
      const entries = readdirSync(pkiDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith(".cert") || entry.name.endsWith(".crt") || entry.name.endsWith(".pem"))) {
          const filePath = join(pkiDir, entry.name);
          const cert = await this.parseCert(filePath, entry.name);
          if (cert) certs.push(cert);
        }
      }
    }

    // Scan host_vars for JWT enrollment tokens (not certs but related)
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (existsSync(hostVarsDir)) {
      const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      for (const host of hosts) {
        const hostPki = join(hostVarsDir, host, "files/pki");
        if (existsSync(hostPki)) {
          const entries = readdirSync(hostPki, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && (entry.name.endsWith(".cert") || entry.name.endsWith(".crt") || entry.name.endsWith(".pem") || entry.name.endsWith(".jwt"))) {
              const filePath = join(hostPki, entry.name);
              if (entry.name.endsWith(".jwt")) {
                // JWT tokens don't have expiry in the file itself, but we can note their presence
                const stat = statSync(filePath);
                const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
                certs.push({
                  id: crypto.randomUUID(),
                  filePath,
                  subject: entry.name,
                  issuer: "AutoNet Controller",
                  notBefore: new Date(stat.mtimeMs),
                  notAfter: new Date(stat.mtimeMs + 30 * 24 * 60 * 60 * 1000), // Assume 30 day validity
                  daysUntilExpiry: Math.floor(30 - ageDays),
                  status: ageDays > 25 ? "expiring-soon" : "valid",
                  type: "identity",
                });
              } else {
                const cert = await this.parseCert(filePath, entry.name);
                if (cert) certs.push(cert);
              }
            }
          }
        }
      }
    }

    return certs.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  private async parseCert(filePath: string, fileName: string): Promise<CertRecord | null> {
    try {
      const proc = Bun.spawn(["openssl", "x509", "-in", filePath, "-noout", "-dates", "-subject", "-issuer"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      if (proc.exitCode !== 0) return null;

      const notBeforeMatch = stdout.match(/notBefore=(.+)/);
      const notAfterMatch = stdout.match(/notAfter=(.+)/);
      const subjectMatch = stdout.match(/subject=([^\n]+)/);
      const issuerMatch = stdout.match(/issuer=([^\n]+)/);

      if (!notBeforeMatch || !notAfterMatch) return null;

      const notBefore = new Date(notBeforeMatch[1]);
      const notAfter = new Date(notAfterMatch[1]);
      const daysUntilExpiry = Math.floor((notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      let type: CertRecord["type"] = "identity";
      if (fileName.includes("root")) type = "root-ca";
      else if (fileName.includes("intermediate")) type = "intermediate-ca";
      else if (fileName.includes("router")) type = "router";
      else if (fileName.includes("ctrl") || fileName.includes("controller")) type = "controller";

      let status: CertRecord["status"] = "valid";
      if (daysUntilExpiry < 0) status = "expired";
      else if (daysUntilExpiry < 30) status = "expiring-soon";

      return {
        id: crypto.randomUUID(),
        filePath,
        subject: subjectMatch?.[1]?.trim() || fileName,
        issuer: issuerMatch?.[1]?.trim() || "unknown",
        notBefore,
        notAfter,
        daysUntilExpiry,
        status,
        type,
      };
    } catch {
      return null;
    }
  }
}
