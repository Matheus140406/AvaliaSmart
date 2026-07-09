import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requireOcrCapacity } from "@/lib/billing/guard";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { processGradeSheetImage } from "@/services/ocr.service";

/**
 * Node.js runtime (não Edge) — mesmo motivo do stub em analytics/predict:
 * esta rota consulta o Prisma (busca alunos/avaliações pra dar contexto ao
 * modelo de visão) e uma chamada de 3-7s cabe folgada no limite padrão do
 * runtime Node, sem precisar de Fluid Compute nem de reescrever o client
 * Prisma pra um driver HTTP.
 *
 * Lógica de negócio (checagem de tenant/professor, chamada à IA de visão,
 * contagem de uso do plano) vive em services/ocr.service.ts.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB de folga sob o limite de payload de Route Handlers

const contextSchema = z.object({
  classSubjectId: z.string().min(1),
  termId: z.string().min(1),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para importar notas.");
  }

  const planBlock = await requireOcrCapacity(user.tenantId);
  if (planBlock) return planBlock;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    throw badRequest("Requisição deve ser multipart/form-data.");
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    throw badRequest("Nenhuma imagem enviada.");
  }
  if (!ACCEPTED_MEDIA_TYPES.has(file.type)) {
    throw badRequest(`Formato não suportado: ${file.type || "desconhecido"}. Use JPEG, PNG, WEBP ou GIF.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw badRequest("Imagem muito grande (máximo 8MB).");
  }

  const contextParsed = contextSchema.safeParse({
    classSubjectId: formData.get("classSubjectId"),
    termId: formData.get("termId"),
  });
  if (!contextParsed.success) {
    throw badRequest("Payload inválido.", contextParsed.error.flatten());
  }
  const { classSubjectId, termId } = contextParsed.data;

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buffer.toString("base64");

  const parsedSpreadsheet = await processGradeSheetImage({
    tenantId: user.tenantId,
    role: user.role,
    membershipId: user.id,
    classSubjectId,
    termId,
    imageBase64,
    mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    fileName: file.name || "foto-lista-notas.jpg",
  });

  return apiSuccess(parsedSpreadsheet);
});
