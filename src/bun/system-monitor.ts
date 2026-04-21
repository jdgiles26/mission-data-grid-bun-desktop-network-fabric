import { cpus, totalmem, freemem, hostname, platform, arch, uptime } from "os";

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percentage: number;
  };
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percentage: number;
  };
  network: {
    hostname: string;
    interfaces: Array<{ name: string; address: string; family: string }>;
  };
  uptime: number;
  platform: string;
  arch: string;
  bunVersion: string;
}

export class SystemMonitor {
  private lastCpuTimes: { idle: number; total: number } | null = null;

  async getMetrics(): Promise<SystemMetrics> {
    const [cpuUsage, diskInfo] = await Promise.all([
      this.getCpuUsage(),
      this.getDiskUsage(),
    ]);

    const cpuInfo = cpus();
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;

    const networkInterfaces = await this.getNetworkInterfaces();

    return {
      cpu: {
        usage: cpuUsage,
        cores: cpuInfo.length,
        model: cpuInfo[0]?.model || "Unknown",
      },
      memory: {
        totalBytes: totalMem,
        usedBytes: usedMem,
        freeBytes: freeMem,
        percentage: Math.round((usedMem / totalMem) * 100),
      },
      disk: diskInfo,
      network: {
        hostname: hostname(),
        interfaces: networkInterfaces,
      },
      uptime: uptime(),
      platform: platform(),
      arch: arch(),
      bunVersion: Bun.version,
    };
  }

  private async getCpuUsage(): Promise<number> {
    const cores = cpus();
    let idle = 0;
    let total = 0;

    for (const core of cores) {
      const { user, nice, sys, irq, idle: coreIdle } = core.times;
      idle += coreIdle;
      total += user + nice + sys + irq + coreIdle;
    }

    if (this.lastCpuTimes) {
      const idleDelta = idle - this.lastCpuTimes.idle;
      const totalDelta = total - this.lastCpuTimes.total;
      this.lastCpuTimes = { idle, total };
      if (totalDelta > 0) {
        return Math.round((1 - idleDelta / totalDelta) * 100);
      }
    }

    this.lastCpuTimes = { idle, total };
    // First call: estimate from current snapshot
    return Math.round((1 - idle / total) * 100);
  }

  private async getDiskUsage(): Promise<SystemMetrics["disk"]> {
    try {
      const proc = Bun.spawn(["df", "-k", "/"], { stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      const lines = stdout.trim().split("\n");
      if (lines.length < 2) throw new Error("Unexpected df output");

      const parts = lines[1].split(/\s+/);
      const totalKB = parseInt(parts[1], 10) || 0;
      const usedKB = parseInt(parts[2], 10) || 0;
      const freeKB = parseInt(parts[3], 10) || 0;

      return {
        totalBytes: totalKB * 1024,
        usedBytes: usedKB * 1024,
        freeBytes: freeKB * 1024,
        percentage: totalKB > 0 ? Math.round((usedKB / totalKB) * 100) : 0,
      };
    } catch {
      return { totalBytes: 0, usedBytes: 0, freeBytes: 0, percentage: 0 };
    }
  }

  private async getNetworkInterfaces(): Promise<Array<{ name: string; address: string; family: string }>> {
    try {
      const proc = Bun.spawn(["ifconfig"], { stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      const result: Array<{ name: string; address: string; family: string }> = [];
      let currentIface = "";

      for (const line of stdout.split("\n")) {
        const ifaceMatch = line.match(/^(\w+[\d]*):?\s/);
        if (ifaceMatch) {
          currentIface = ifaceMatch[1];
        }

        const inetMatch = line.match(/inet\s+([\d.]+)/);
        if (inetMatch && currentIface) {
          result.push({ name: currentIface, address: inetMatch[1], family: "IPv4" });
        }
      }

      return result.filter((iface) => iface.address !== "127.0.0.1");
    } catch {
      return [];
    }
  }
}
