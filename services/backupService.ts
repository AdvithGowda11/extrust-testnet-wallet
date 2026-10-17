import { EncryptedBackup, validateBackup } from "@/lib/backupFormat";
export type { EncryptedBackup } from "@/lib/backupFormat";
const ITERATIONS = 600000;
function cryptoApi() {
  if (!globalThis.crypto?.subtle)
    throw new Error("Encryption requires HTTPS or localhost");
  return globalThis.crypto;
}
function b64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}
function bytes(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function key(password: string, salt: Uint8Array, iterations: number) {
  const base = await cryptoApi().subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi().subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export class BackupService {
  static async encrypt(
    payload: unknown,
    password: string,
  ): Promise<EncryptedBackup> {
    if (password.length < 12 || password.length > 1024)
      throw new Error("Use a passphrase of 12–1024 characters");
    const plain = new TextEncoder().encode(JSON.stringify(payload));
    if (plain.length > 60000) throw new Error("Backup is too large");
    const salt = cryptoApi().getRandomValues(new Uint8Array(16));
    const iv = cryptoApi().getRandomValues(new Uint8Array(12));
    const ciphertext = await cryptoApi().subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(password, salt, ITERATIONS),
      plain,
    );
    return {
      version: 2,
      ciphertext: b64(new Uint8Array(ciphertext)),
      salt: b64(salt),
      iv: b64(iv),
      kdfIterations: ITERATIONS,
    };
  }
  static async decrypt(backup: unknown, password: string): Promise<unknown> {
    validateBackup(backup);
    if (password.length > 1024) throw new Error("Invalid passphrase");
    try {
      const plain = await cryptoApi().subtle.decrypt(
        { name: "AES-GCM", iv: bytes(backup.iv) },
        await key(password, bytes(backup.salt), backup.kdfIterations),
        bytes(backup.ciphertext),
      );
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      throw new Error("Incorrect passphrase or damaged backup");
    }
  }
  static fingerprint(address: string) {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }
}
