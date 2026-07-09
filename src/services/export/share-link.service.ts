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
 */
const EXPORT_SHARE_LINK_TTL_MS = 15 * 60 * 1000;

export type ExportShareLinkKind = "dashboard-pdf" | "dashboard-excel" | "boletim-pdf" | "receipt-pdf";

const KIND_REQUIRED_PARAMS: Record<ExportShareLinkKind, string[]> = {
  "dashboard-pdf": [],
  "dashboard-excel": [],
  "boletim-pdf": ["enrollmentId"],
  "receipt-pdf": ["receiptId"],
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
  const expiresAt = new Date(Date.now() + EXPORT_SHARE_LINK_TTL_MS);

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
