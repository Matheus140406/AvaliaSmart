import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const transaction = vi.fn((ops: unknown[]) => Promise.all(ops));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    auditLog: { create: vi.fn() },
    $transaction: (...a: unknown[]) => transaction(...(a as [unknown[]])),
  },
}));

const consumeRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a),
}));

const generateTotpSecret = vi.fn();
const verifyTotpCode = vi.fn();
const buildOtpAuthUri = vi.fn();
vi.mock("@/lib/mfa/totp", () => ({
  generateTotpSecret: (...a: unknown[]) => generateTotpSecret(...a),
  verifyTotpCode: (...a: unknown[]) => verifyTotpCode(...a),
  buildOtpAuthUri: (...a: unknown[]) => buildOtpAuthUri(...a),
}));

const encryptSecret = vi.fn();
const decryptSecret = vi.fn();
vi.mock("@/lib/mfa/secret-crypto", () => ({
  encryptSecret: (...a: unknown[]) => encryptSecret(...a),
  decryptSecret: (...a: unknown[]) => decryptSecret(...a),
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,fake") },
}));

import bcrypt from "bcryptjs";
import { startMfaSetup, confirmMfaSetup, disableMfa, verifyMfaChallenge } from "@/services/mfa.service";

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
});

describe("startMfaSetup", () => {
  it("404 se o usuário não existe", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(startMfaSetup("u1", "prof@escola.com")).rejects.toMatchObject({ status: 404 });
  });

  it("400 se MFA já está ativado", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", mfaEnabled: true });
    await expect(startMfaSetup("u1", "prof@escola.com")).rejects.toMatchObject({ status: 400 });
  });

  it("gera segredo, cifra e salva como pendente, devolve otpauthUri + QR", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", mfaEnabled: false });
    generateTotpSecret.mockReturnValue("SECRETBASE32");
    encryptSecret.mockReturnValue("cifrado");
    buildOtpAuthUri.mockReturnValue("otpauth://totp/x");

    const result = await startMfaSetup("u1", "prof@escola.com");

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mfaSecretEncrypted: "cifrado" } });
    expect(result).toEqual({ secret: "SECRETBASE32", otpauthUri: "otpauth://totp/x", qrCodeDataUri: "data:image/png;base64,fake" });
  });
});

describe("confirmMfaSetup", () => {
  it("404 se o usuário não existe", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(confirmMfaSetup("u1", "123456")).rejects.toMatchObject({ status: 404 });
  });

  it("400 se já está ativado", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", mfaEnabled: true, mfaSecretEncrypted: "x" });
    await expect(confirmMfaSetup("u1", "123456")).rejects.toMatchObject({ status: 400 });
  });

  it("400 se não há segredo pendente", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", mfaEnabled: false, mfaSecretEncrypted: null });
    await expect(confirmMfaSetup("u1", "123456")).rejects.toMatchObject({ status: 400 });
  });

  it("400 se o código estiver errado", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", mfaEnabled: false, mfaSecretEncrypted: "cifrado" });
    decryptSecret.mockReturnValue("SECRETBASE32");
    verifyTotpCode.mockReturnValue(false);
    await expect(confirmMfaSetup("u1", "000000")).rejects.toMatchObject({ status: 400 });
  });

  it("ativa MFA e devolve 8 códigos de recuperação em texto puro quando o código bate", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", mfaEnabled: false, mfaSecretEncrypted: "cifrado" });
    decryptSecret.mockReturnValue("SECRETBASE32");
    verifyTotpCode.mockReturnValue(true);

    const result = await confirmMfaSetup("u1", "123456");

    expect(result.recoveryCodes).toHaveLength(8);
    for (const code of result.recoveryCodes) {
      expect(code).toMatch(/^\d{4}-\d{4}-\d{2}$/);
    }
    expect(transaction).toHaveBeenCalled();
  });
});

describe("disableMfa", () => {
  it("400 se MFA não está ativado", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", mfaEnabled: false });
    await expect(disableMfa("u1", "senha")).rejects.toMatchObject({ status: 400 });
  });

  it("403 se a conta não tem senha local", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", mfaEnabled: true, passwordHash: null });
    await expect(disableMfa("u1", "senha")).rejects.toMatchObject({ status: 403 });
  });
});

describe("verifyMfaChallenge", () => {
  it("nega quando o rate limit estourou (mesmo com código certo)", async () => {
    consumeRateLimit.mockResolvedValue(false);
    const ok = await verifyMfaChallenge({ id: "u1", mfaSecretEncrypted: "cifrado", mfaRecoveryCodes: [] }, { totpCode: "123456", ip: "1.2.3.4" });
    expect(ok).toBe(false);
  });

  it("valida o código TOTP contra o segredo decifrado", async () => {
    consumeRateLimit.mockResolvedValue(true);
    decryptSecret.mockReturnValue("SECRETBASE32");
    verifyTotpCode.mockReturnValue(true);

    const ok = await verifyMfaChallenge({ id: "u1", mfaSecretEncrypted: "cifrado", mfaRecoveryCodes: [] }, { totpCode: "123456", ip: "1.2.3.4" });

    expect(ok).toBe(true);
    expect(verifyTotpCode).toHaveBeenCalledWith("SECRETBASE32", "123456");
  });

  it("devolve false quando nem totpCode nem recoveryCode foram enviados", async () => {
    consumeRateLimit.mockResolvedValue(true);
    const ok = await verifyMfaChallenge({ id: "u1", mfaSecretEncrypted: "cifrado", mfaRecoveryCodes: [] }, { ip: "1.2.3.4" });
    expect(ok).toBe(false);
  });

  it("aceita um código de recuperação válido e o remove da lista (uso único)", async () => {
    consumeRateLimit.mockResolvedValue(true);
    const plainCode = "1234-5678-90";
    const hash = await bcrypt.hash(plainCode, 10);
    const otherHash = await bcrypt.hash("outro-codigo", 10);

    const ok = await verifyMfaChallenge(
      { id: "u1", mfaSecretEncrypted: null, mfaRecoveryCodes: [hash, otherHash] },
      { recoveryCode: plainCode, ip: "1.2.3.4" }
    );

    expect(ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mfaRecoveryCodes: [otherHash] } });
  });

  it("rejeita um código de recuperação que não bate com nenhum hash salvo", async () => {
    consumeRateLimit.mockResolvedValue(true);
    const hash = await bcrypt.hash("codigo-real", 10);

    const ok = await verifyMfaChallenge(
      { id: "u1", mfaSecretEncrypted: null, mfaRecoveryCodes: [hash] },
      { recoveryCode: "codigo-errado", ip: "1.2.3.4" }
    );

    expect(ok).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
