import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { base32Encode, base32Decode } from "./base32";

/**
 * TOTP (RFC 6238) sobre HOTP (RFC 4226) — implementado com `node:crypto`
 * puro, sem dependência nova: é criptografia simples (HMAC-SHA1 + truncamento
 * dinâmico), bem especificada, e evita mais uma dependência de terceiros
 * pra código de segurança sensível.
 */

const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_WINDOW = 1; // tolera ±1 passo (±30s) de dessincronia de relógio

function hotp(secret: Buffer, counter: bigint, digits: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);

  const code = (binary % 10 ** digits).toString().padStart(digits, "0");
  return code;
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20)); // 160 bits — mesmo tamanho do secret de exemplo do RFC 6238
}

export function totpCodeAt(
  secretBase32: string,
  unixSeconds: number,
  options?: { digits?: number; periodSeconds?: number }
): string {
  const digits = options?.digits ?? DEFAULT_DIGITS;
  const period = options?.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const counter = BigInt(Math.floor(unixSeconds / period));
  return hotp(base32Decode(secretBase32), counter, digits);
}

/** Compara código a código com `timingSafeEqual` — evita vazar por timing qual dígito bateu primeiro. */
function codesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Verifica um código de 6 dígitos contra o passo atual e os `window`
 * passos vizinhos (antes E depois) — tolerância padrão de apps
 * autenticadores pra relógio levemente dessincronizado.
 */
export function verifyTotpCode(
  secretBase32: string,
  submittedCode: string,
  options?: { digits?: number; periodSeconds?: number; window?: number; nowSeconds?: number }
): boolean {
  if (!/^\d+$/.test(submittedCode)) return false;

  const digits = options?.digits ?? DEFAULT_DIGITS;
  const period = options?.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const window = options?.window ?? DEFAULT_WINDOW;
  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);

  for (let step = -window; step <= window; step++) {
    const candidate = totpCodeAt(secretBase32, now + step * period, { digits, periodSeconds: period });
    if (codesMatch(candidate, submittedCode)) return true;
  }
  return false;
}

/** URI `otpauth://` padrão — o QR gerado a partir dele é o que os apps autenticadores escaneiam. */
export function buildOtpAuthUri(params: { secretBase32: string; accountLabel: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountLabel}`);
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
