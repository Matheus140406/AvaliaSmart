import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requireAiFeature } from "@/services/ai/guard";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden, HttpError } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { extractDocumentTextFromImage } from "@/lib/ocr/extract-document-text";
import { gradeEssay } from "@/services/ai/essay-grading.service";

/**
 * POST /api/ai/essay-grading — Etapa 5 da expansão de produtividade docente
 * (feature mais sensível: nota SUGERIDA de aluno, nunca final).
 *
 * multipart/form-data com EXATAMENTE um dos dois pra texto: `text` (redação
 * já digitada) ou `image` (foto/scan) — e EXATAMENTE um dos dois pra
 * critério: `criteriaPreset=ENEM` ou `customCriteria` (o professor descreve
 * o próprio critério).
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const fieldsSchema = z.object({
  text: z.string().trim().min(1).optional(),
  criteriaPreset: z.literal("ENEM").optional(),
  customCriteria: z.string().trim().min(10).optional(),
  studentLabel: z.string().trim().max(120).optional(),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para corrigir redações.");
  }

  const accessBlock = await requireAiFeature(user.tenantId, "essayGrading");
  if (accessBlock) return accessBlock;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    throw badRequest("Requisição deve ser multipart/form-data.");
  }

  const parsedFields = fieldsSchema.safeParse({
    text: formData.get("text") ?? undefined,
    criteriaPreset: formData.get("criteriaPreset") ?? undefined,
    customCriteria: formData.get("customCriteria") ?? undefined,
    studentLabel: formData.get("studentLabel") ?? undefined,
  });
  if (!parsedFields.success) {
    throw badRequest("Payload inválido.", parsedFields.error.flatten());
  }

  const file = formData.get("image");
  const hasText = Boolean(parsedFields.data.text);
  const hasImage = file instanceof File;
  if (hasText === hasImage) {
    throw badRequest("Informe `text` OU `image` (exatamente um dos dois).");
  }

  const hasPreset = Boolean(parsedFields.data.criteriaPreset);
  const hasCustomCriteria = Boolean(parsedFields.data.customCriteria);
  if (hasPreset === hasCustomCriteria) {
    throw badRequest("Informe `criteriaPreset=ENEM` OU `customCriteria` (exatamente um dos dois).");
  }

  let essayText: string;
  if (hasImage) {
    const image = file as File;
    if (!ACCEPTED_MEDIA_TYPES.has(image.type)) {
      throw badRequest(`Formato não suportado: ${image.type || "desconhecido"}. Use JPEG, PNG, WEBP ou GIF.`);
    }
    if (image.size > MAX_IMAGE_BYTES) {
      throw badRequest("Imagem muito grande (máximo 8MB).");
    }
    const buffer = Buffer.from(await image.arrayBuffer());
    try {
      essayText = await extractDocumentTextFromImage(
        buffer.toString("base64"),
        image.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif"
      );
    } catch (err) {
      console.error("[essay-grading] falha ao extrair texto da imagem:", err);
      throw new HttpError(502, "Não foi possível processar a imagem. Tente novamente ou com outra foto.");
    }
  } else {
    essayText = parsedFields.data.text as string;
  }

  const grading = await gradeEssay({
    tenantId: user.tenantId,
    membershipId: user.id,
    essayText,
    studentLabel: parsedFields.data.studentLabel,
    criteriaPreset: parsedFields.data.criteriaPreset,
    customCriteria: parsedFields.data.customCriteria,
  });

  return apiSuccess(grading);
});
