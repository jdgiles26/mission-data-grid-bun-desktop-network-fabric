import type { Database, StoredCredentials } from "./database";
import type { MDGDataRecord, SyncStatus } from "../shared/types";

interface CodiceConfig {
  baseUrl: string;
  apiVersion: string;
}

interface SyncCredentials {
  apiKey: string;
  jwtToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

const DEFAULT_CODICE_BASE_URL = "https://api.codicealliance.mil";

export class CodiceSyncEngine {
  private readonly db: Database;
  private config: CodiceConfig;
  private credentials: SyncCredentials | null = null;
  private lastSyncStatus: SyncStatus = {
    lastSync: null,
    pendingRecords: 0,
    syncedRecords: 0,
    failedRecords: 0,
    connectionStatus: "DISCONNECTED",
  };

  constructor(db: Database) {
    this.db = db;
    const stored = db.getCredentials();
    this.config = {
      baseUrl: this.normalizeBaseUrl(stored.codiceBaseUrl || Bun.env.MDG_CODICE_BASE_URL || DEFAULT_CODICE_BASE_URL),
      apiVersion: "v1",
    };

    if (stored.apiKey) {
      this.credentials = {
        apiKey: stored.apiKey,
        jwtToken: stored.jwtToken,
        refreshToken: stored.refreshToken,
        expiresAt: stored.expiresAt,
      };
    }
  }

  setCredentials(creds: { apiKey: string; jwtToken?: string; refreshToken?: string; codiceBaseUrl?: string }): boolean {
    this.credentials = {
      apiKey: creds.apiKey,
      jwtToken: creds.jwtToken,
      refreshToken: creds.refreshToken,
    };

    if (creds.codiceBaseUrl) {
      this.config.baseUrl = this.normalizeBaseUrl(creds.codiceBaseUrl);
    }

    this.db.saveCredentials({
      apiKey: creds.apiKey,
      jwtToken: creds.jwtToken,
      refreshToken: creds.refreshToken,
      codiceBaseUrl: this.config.baseUrl,
    });

    this.checkConnection().catch((error) => {
      console.error("Connection check failed after updating credentials:", error);
    });
    return true;
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  setBaseUrl(baseUrl: string): void {
    this.config.baseUrl = this.normalizeBaseUrl(baseUrl);
    this.db.saveCredentials({
      ...this.db.getCredentials(),
      codiceBaseUrl: this.config.baseUrl,
    });
  }

  async checkConnection(): Promise<boolean> {
    if (!this.credentials?.apiKey) {
      this.lastSyncStatus.connectionStatus = "DISCONNECTED";
      return false;
    }

    const endpoints = [
      `${this.config.baseUrl}/health`,
      `${this.config.baseUrl}/${this.config.apiVersion}/health`,
      `${this.config.baseUrl}/api/health`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.request(endpoint, { method: "GET" }, 5_000);
        if (response.ok) {
          this.lastSyncStatus.connectionStatus = "CONNECTED";
          return true;
        }
      } catch {
        // Try the next health endpoint.
      }
    }

    this.lastSyncStatus.connectionStatus = "DISCONNECTED";
    return false;
  }

  async syncNow(): Promise<{ success: boolean; synced: number; failed: number }> {
    if (!this.credentials?.apiKey) {
      this.lastSyncStatus.connectionStatus = "DISCONNECTED";
      return { success: false, synced: 0, failed: 0 };
    }

    const connected = await this.checkConnection();
    if (!connected) {
      return { success: false, synced: 0, failed: 0 };
    }

    this.lastSyncStatus.connectionStatus = "SYNCING";
    const unsynced = this.db.getUnsyncedRecords();
    let synced = 0;
    let failed = 0;

    for (const record of unsynced) {
      try {
        await this.syncRecord(record);
        this.db.markRecordSynced(record.id);
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.db.markRecordFailed(record.id, message);
        failed += 1;
      }
    }

    const stats = this.db.getSyncStats();
    this.lastSyncStatus = {
      lastSync: new Date(),
      pendingRecords: stats.pending,
      syncedRecords: stats.synced,
      failedRecords: stats.failed,
      connectionStatus: failed > 0 ? "CONNECTED" : "CONNECTED",
    };

    return { success: failed === 0, synced, failed };
  }

  getStatus(): SyncStatus {
    const stats = this.db.getSyncStats();
    return {
      ...this.lastSyncStatus,
      pendingRecords: stats.pending,
      syncedRecords: stats.synced,
      failedRecords: stats.failed,
    };
  }

  async refreshToken(): Promise<boolean> {
    if (!this.credentials?.refreshToken) {
      return false;
    }

    const endpoint = `${this.config.baseUrl}/auth/refresh`;
    try {
      const response = await this.request(
        endpoint,
        {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify({ refresh_token: this.credentials.refreshToken }),
        },
        8_000,
      );

      if (!response.ok) {
        return false;
      }

      const payload = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!payload.access_token) {
        return false;
      }

      const expiresAt = payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000)
        : undefined;

      this.credentials.jwtToken = payload.access_token;
      this.credentials.refreshToken = payload.refresh_token || this.credentials.refreshToken;
      this.credentials.expiresAt = expiresAt;

      this.db.saveCredentials({
        apiKey: this.credentials.apiKey,
        jwtToken: this.credentials.jwtToken,
        refreshToken: this.credentials.refreshToken,
        expiresAt,
        codiceBaseUrl: this.config.baseUrl,
      });
      return true;
    } catch {
      return false;
    }
  }

  isTokenExpired(): boolean {
    if (!this.credentials?.expiresAt) {
      return false;
    }
    return this.credentials.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  }

  getStoredCredentials(): StoredCredentials {
    return this.db.getCredentials();
  }

  private async syncRecord(record: MDGDataRecord): Promise<void> {
    if (!this.credentials) {
      throw new Error("Missing credentials");
    }

    if (this.isTokenExpired()) {
      await this.refreshToken();
    }

    const body = JSON.stringify({
      id: record.id,
      timestamp: record.timestamp.toISOString(),
      kit_id: record.kitId,
      priority: record.priority,
      classification: record.classification,
      data_type: record.dataType,
      payload: record.payload,
    });

    const endpoints = [
      `${this.config.baseUrl}/${this.config.apiVersion}/records`,
      `${this.config.baseUrl}/records`,
    ];

    let lastError: Error | null = null;
    for (const endpoint of endpoints) {
      try {
        const response = await this.request(
          endpoint,
          {
            method: "POST",
            headers: this.buildHeaders(),
            body,
          },
          10_000,
        );

        if (response.ok) {
          return;
        }

        const responseText = await response.text();
        throw new Error(`HTTP ${response.status}: ${responseText || response.statusText}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error("No sync endpoint accepted the record");
  }

  private buildHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.credentials?.apiKey || "",
    };
    if (this.credentials?.jwtToken) {
      headers.Authorization = `Bearer ${this.credentials.jwtToken}`;
    }
    return headers;
  }

  private async request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, "");
  }
}
