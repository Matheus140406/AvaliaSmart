import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/http/errors";

/**
 * Criptografia em repouso do segredo TOTP (AES-256-GCM) — diferente da
 * senha (bcrypt, uma via), o segredo TOTP precisa ser recuperável pra
 * gerar/validar códigos, então não pode ser hash. Chave vem de
 * `MFA_ENCRYPTION_KEY` (32 bytes, base64), nunca do banco — comprometer o
 * banco sozinho não expõe os segredos de MFA.
 */

function getEncryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new HttpError(500, "MFA_ENCRYPTION_KEY não configurada — MFA indisponível neste ambiente.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new HttpError(500, "MFA_ENCRYPTION_KEY inválida — precisa ser 32 bytes em base64.");
  }
  return key;
}

/** Formato: base64(iv).base64(authTag).base64(ciphertext) */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96 bits — tamanho recomendado pra GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new HttpError(500, "Segredo de MFA corrompido.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
