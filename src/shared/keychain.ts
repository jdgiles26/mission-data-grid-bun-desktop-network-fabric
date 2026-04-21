/**
 * Keychain Integration - Secure credential storage using OS Keychain
 * Never store secrets in localStorage, memory, or config files
 */

interface KeychainRequest {
  service: string;
  account: string;
  password?: string;
}

/**
 * Retrieve credential from OS Keychain (macOS/Linux/Windows Credential Manager)
 */
export async function getCredential(service: string, account: string): Promise<string | null> {
  try {
    // In Electron context, use ipcRenderer to access main process
    if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) {
      return await (window as any).electronAPI.invoke('keychain:get', { service, account });
    }
    
    // Fallback for web context (use secure storage)
    const key = `keychain:${service}:${account}`;
    const stored = sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('[Keychain] Failed to retrieve credential:', error);
    return null;
  }
}

/**
 * Store credential in OS Keychain
 */
export async function setCredential(service: string, account: string, password: string): Promise<void> {
  try {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) {
      await (window as any).electronAPI.invoke('keychain:set', { service, account, password });
    } else {
      // Fallback: use sessionStorage only (cleared on app close)
      const key = `keychain:${service}:${account}`;
      sessionStorage.setItem(key, JSON.stringify(password));
    }
  } catch (error) {
    console.error('[Keychain] Failed to store credential:', error);
    throw error;
  }
}

/**
 * Delete credential from OS Keychain
 */
export async function deleteCredential(service: string, account: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) {
      await (window as any).electronAPI.invoke('keychain:delete', { service, account });
    } else {
      const key = `keychain:${service}:${account}`;
      sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.error('[Keychain] Failed to delete credential:', error);
  }
}

/**
 * Check if credential exists in Keychain
 */
export async function hasCredential(service: string, account: string): Promise<boolean> {
  const credential = await getCredential(service, account);
  return credential !== null;
}

/**
 * Update credential while ensuring secure handling
 */
export async function updateCredential(
  service: string,
  account: string,
  newPassword: string
): Promise<void> {
  await deleteCredential(service, account);
  await setCredential(service, account, newPassword);
}

/**
 * Batch get credentials with error handling
 */
export async function getCredentials(
  requests: Array<{ service: string; account: string }>
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  
  for (const { service, account } of requests) {
    const key = `${service}:${account}`;
    const credential = await getCredential(service, account);
    results.set(key, credential);
  }
  
  return results;
}

/**
 * Backend API credential management
 */
export class BackendCredentials {
  private static readonly SERVICE = 'mission-data-grid';
  private static readonly ACCOUNT = 'backend-api';

  static async getApiToken(): Promise<string | null> {
    return getCredential(this.SERVICE, `${this.ACCOUNT}:token`);
  }

  static async setApiToken(token: string): Promise<void> {
    return setCredential(this.SERVICE, `${this.ACCOUNT}:token`, token);
  }

  static async deleteApiToken(): Promise<void> {
    return deleteCredential(this.SERVICE, `${this.ACCOUNT}:token`);
  }

  static async getRefreshToken(): Promise<string | null> {
    return getCredential(this.SERVICE, `${this.ACCOUNT}:refresh`);
  }

  static async setRefreshToken(token: string): Promise<void> {
    return setCredential(this.SERVICE, `${this.ACCOUNT}:refresh`, token);
  }

  static async clear(): Promise<void> {
    await this.deleteApiToken();
    await deleteCredential(this.SERVICE, `${this.ACCOUNT}:refresh`);
  }
}

/**
 * User authentication credential management
 */
export class UserCredentials {
  private static readonly SERVICE = 'mission-data-grid';

  static async getCredential(username: string): Promise<string | null> {
    return getCredential(this.SERVICE, `user:${username}`);
  }

  static async setCredential(username: string, password: string): Promise<void> {
    return setCredential(this.SERVICE, `user:${username}`, password);
  }

  static async deleteCredential(username: string): Promise<void> {
    return deleteCredential(this.SERVICE, `user:${username}`);
  }

  static async authenticate(username: string, passwordToCheck: string): Promise<boolean> {
    const storedPassword = await this.getCredential(username);
    if (!storedPassword) return false;

    // In production, use proper password hashing (bcrypt)
    // This is simplified for demo purposes
    return storedPassword === passwordToCheck;
  }
}

/**
 * Session token management (in-memory only, never persisted)
 */
export class SessionTokens {
  private static tokens: Map<string, { token: string; expiresAt: number }> = new Map();

  static setToken(id: string, token: string, expiresIn: number = 3600000): void {
    this.tokens.set(id, {
      token,
      expiresAt: Date.now() + expiresIn,
    });
  }

  static getToken(id: string): string | null {
    const entry = this.tokens.get(id);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.tokens.delete(id);
      return null;
    }

    return entry.token;
  }

  static deleteToken(id: string): void {
    this.tokens.delete(id);
  }

  static clear(): void {
    this.tokens.clear();
  }

  static isExpired(id: string): boolean {
    const entry = this.tokens.get(id);
    return !entry || Date.now() > entry.expiresAt;
  }
}
