export interface EncryptedBackup {
  version: 2;
  ciphertext: string;
  salt: string;
  iv: string;
  kdfIterations: number;
}
export function validateBackup(
  value: unknown,
): asserts value is EncryptedBackup {
  const b = value as EncryptedBackup;
  const valid64 = (s: unknown) =>
    typeof s === "string" &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(s) &&
    s.length % 4 === 0;
  if (
    !b ||
    b.version !== 2 ||
    !valid64(b.ciphertext) ||
    b.ciphertext.length < 24 ||
    b.ciphertext.length > 90000 ||
    !valid64(b.salt) ||
    !valid64(b.iv) ||
    b.salt.length !== 24 ||
    b.iv.length !== 16 ||
    !Number.isInteger(b.kdfIterations) ||
    b.kdfIterations < 210000 ||
    b.kdfIterations > 1000000
  )
    throw new Error("Invalid or unsupported encrypted backup");
  if (atob(b.salt).length !== 16 || atob(b.iv).length !== 12)
    throw new Error("Invalid encryption parameters");
}
