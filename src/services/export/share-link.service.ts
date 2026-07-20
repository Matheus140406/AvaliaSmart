import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/http/errors";

/**
 * Link de download temporário/assinado pra "Compartilhar no WhatsApp" (ver
 * `ExportShareLink` no schema pro porquê). 15min de propósito — é uma
 * conveniência pro professor compartilhar o que ele mesmo acabou de gerar,
 * não um link permanente; multi-uso dentro da janela (não apaga no
 * primeiro acesso) porque quem recebe no WhatsApp pode abrir mais de uma
 * vez em poucos minutos sem que isso seja um problema de segurança real.
 *
 * `boletim-portal` é a EXCEÇÃO de propósito: um link de boletim pensado pra
 * o responsável salvar/revisitar (não um compartilhamento pontual), então
 * precisa durar mais — 90 dias em vez de 15 minutos. Mesma infraestrutura
 * (token de 192 bits, mesma rota pública de download), só o TTL muda.
 */
const DEFAULT_SHARE_LINK_TTL_MS = 15 * 60 * 1000;
const KIND_TTL_MS: Partial<Record<ExportShareLinkKind, number>> = {
  "boletim-portal": 90 * 24 * 60 * 60 * 1000,
};

export type ExportShareLinkKind = "dashboard-pdf" | "dashboard-excel" | "boletim-pdf" | "receipt-pdf" | "boletim-portal";

const KIND_REQUIRED_PARAMS: Record<ExportShareLinkKind, string[]> = {
  "dashboard-pdf": [],
  "dashboard-excel": [],
  "boletim-pdf": ["enrollmentId"],
  "receipt-pdf": ["receiptId"],
  "boletim-portal": ["enrollmentId"],
};

export async function createExportShareLink(
  tenantId: string,
  kind: ExportShareLinkKind,
  params: Record<string, string>
): Promise<{ token: string; expiresAt: Date }> {
  const required = KIND_REQUIRED_PARAMS[kind];
  for (const key of required) {
    if (!params[key]) throw badRequest(`Parâmetro "${key}" é obrigatório pra compartilhar "${kind}".`);
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + (KIND_TTL_MS[kind] ?? DEFAULT_SHARE_LINK_TTL_MS));

  await prisma.exportShareLink.create({
    data: { token, tenantId, kind, params, expiresAt },
  });

  return { token, expiresAt };
}

export interface RedeemedExportShareLink {
  tenantId: string;
  kind: ExportShareLinkKind;
  params: Record<string, string>;
}

export async function redeemExportShareLink(token: string): Promise<RedeemedExportShareLink> {
  const link = await prisma.exportShareLink.findUnique({ where: { token } });
  if (!link || link.expiresAt.getTime() < Date.now()) {
    throw notFound("Link de download expirado ou inválido — gere um novo compartilhamento.");
  }
  return {
    tenantId: link.tenantId,
    kind: link.kind as ExportShareLinkKind,
    params: link.params as Record<string, string>,
  };
}
