import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { generateTotpSecret, verifyTotpCode, buildOtpAuthUri } from "@/lib/mfa/totp";
import { encryptSecret, decryptSecret } from "@/lib/mfa/secret-crypto";
import { badRequest, forbidden, notFound } from "@/lib/http/errors";

/**
 * MFA por TOTP (Etapa de segurança — item que ficava como "report-only" no
 * diagnóstico original). Conta global (`User`), não escopada a tenant — por
 * isso usa `prisma` direto, mesmo padrão de `organization.service.ts`.
 *
 * Fluxo: setup gera segredo PENDENTE (mfaEnabled ainda false) -> confirm
 * exige o primeiro código válido pra ativar de verdade (evita "ativar" um
 * QR que o usuário nunca escaneou de fato) -> a partir daí, login exige o
 * código a cada vez (ver lib/auth.ts).
 */

const ISSUER = "AvaliaSmart";
const RECOVERY_CODE_COUNT = 8;

function generateRecoveryCode(): string {
  // 10 dígitos em 2 blocos "1234-5678-90" — fácil de digitar, difícil de adivinhar (10^10 combinações).
  const digits = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join("");
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 10)}`;
}

export interface MfaSetupResult {
  secret: string;
  otpauthUri: string;
  qrCodeDataUri: string;
}

export async function startMfaSetup(userId: string, userEmail: string): Promise<MfaSetupResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuário não encontrado.");
  if (user.mfaEnabled) throw badRequest("MFA já está ativado nesta conta — desative antes de gerar um novo QR.");

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecretEncrypted: encryptSecret(secret) },
  });

  const otpauthUri = buildOtpAuthUri({ secretBase32: secret, accountLabel: userEmail, issuer: ISSUER });
  const qrCodeDataUri = await QRCode.toDataURL(otpauthUri);

  return { secret, otpauthUri, qrCodeDataUri };
}

export async function confirmMfaSetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuário não encontrado.");
  if (user.mfaEnabled) throw badRequest("MFA já está ativado nesta conta.");
  if (!user.mfaSecretEncrypted) throw badRequest("Nenhum QR pendente — gere um novo QR primeiro.");

  const secret = decryptSecret(user.mfaSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    throw badRequest("Código inválido. Confira o app autenticador e tente de novo.");
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const recoveryCodeHashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaRecoveryCodes: recoveryCodeHashes },
    }),
    prisma.auditLog.create({
      data: { action: "UPDATE", model: "User", recordId: userId, newValue: { mfaEnabled: true } },
    }),
  ]);

  return { recoveryCodes };
}

export async function disableMfa(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuário não encontrado.");
  if (!user.mfaEnabled) throw badRequest("MFA não está ativado nesta conta.");
  if (!user.passwordHash) throw forbidden("Esta conta não tem senha local configurada.");

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) throw forbidden("Senha incorreta.");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaRecoveryCodes: [] },
    }),
    prisma.auditLog.create({
      data: { action: "UPDATE", model: "User", recordId: userId, newValue: { mfaEnabled: false } },
    }),
  ]);
}

export interface MfaChallengeUser {
  id: string;
  mfaSecretEncrypted: string | null;
  mfaRecoveryCodes: string[];
}

/**
 * Verifica o segundo fator no LOGIN — chamado de dentro de `authorize()`
 * (lib/auth.ts), depois que a senha já bateu. Rate limit próprio (6 dígitos
 * = só 1 milhão de combinações, não pode depender só do limite geral de
 * login). Recovery code consumido (removido da lista) no primeiro uso.
 */
export async function verifyMfaChallenge(
  user: MfaChallengeUser,
  params: { totpCode?: string; recoveryCode?: string; ip: string }
): Promise<boolean> {
  const allowed = await consumeRateLimit(`mfa:${user.id}`, 8, 5 * 60 * 1000);
  if (!allowed) return false;

  if (params.totpCode && user.mfaSecretEncrypted) {
    const secret = decryptSecret(user.mfaSecretEncrypted);
    return verifyTotpCode(secret, params.totpCode);
  }

  if (params.recoveryCode) {
    for (const hash of user.mfaRecoveryCodes) {
      if (await bcrypt.compare(params.recoveryCode, hash)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((h) => h !== hash) },
        });
        return true;
      }
    }
  }

  return false;
}
