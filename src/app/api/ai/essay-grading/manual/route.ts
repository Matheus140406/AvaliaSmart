import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requireAiFeature, recordAiUsage } from "@/services/ai/guard";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden, HttpError } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { extractDocumentTextFromImage } from "@/lib/ocr/extract-document-text";
import { gradeEssayManually } from "@/services/ai/essay-grading.service";

/**
 * POST /api/ai/essay-grading/manual — caminho SEM IA da correção de redação:
 * o professor vê o texto (digitado ou extraído por OCR, mesmo utilitário do
 * caminho IA) e atribui a nota ele mesmo. Só a extração por imagem chama um
 * provider de IA (OCR) — texto colado direto não consome nada de IA, então
 * o gate de plano/uso só entra nesse caso.
 *
 * multipart/form-data, igual `/api/ai/essay-grading`: EXATAMENTE um de
 * `text`/`image` pra conteúdo da redação.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const fieldsSchema = z.object({
  text: z.string().trim().min(1).optional(),
  studentLabel: z.string().trim().max(120).optional(),
  overallScore: z.coerce.number().min(0),
  overallMaxScore: z.coerce.number().min(1),
  annotations: z.string().trim().min(1),
  studentFeedback: z.string().trim().optional(),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para corrigir redações.");
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    throw badRequest("Requisição deve ser multipart/form-data.");
  }

  const parsedFields = fieldsSchema.safeParse({
    text: formData.get("text") ?? undefined,
    studentLabel: formData.get("studentLabel") ?? undefined,
    overallScore: formData.get("overallScore") ?? undefined,
    overallMaxScore: formData.get("overallMaxScore") ?? undefined,
    annotations: formData.get("annotations") ?? undefined,
    studentFeedback: formData.get("studentFeedback") ?? undefined,
  });
  if (!parsedFields.success) {
    throw badRequest(parsedFields.error.issues[0]?.message ?? "Payload inválido.", parsedFields.error.flatten());
  }

  const file = formData.get("image");
  const hasText = Boolean(parsedFields.data.text);
  const hasImage = file instanceof File;
  if (hasText === hasImage) {
    throw badRequest("Informe `text` OU `image` (exatamente um dos dois).");
  }

  let essayText: string;
  if (hasImage) {
    const accessBlock = await requireAiFeature(user.tenantId, "essayGrading");
    if (accessBlock) return accessBlock;

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
      await recordAiUsage({ tenantId: user.tenantId, membershipId: user.id, feature: "CORRECAO_REDACAO", success: true });
    } catch (err) {
      await recordAiUsage({ tenantId: user.tenantId, membershipId: user.id, feature: "CORRECAO_REDACAO", success: false });
      console.error("[essay-grading-manual] falha ao extrair texto da imagem:", err);
      throw new HttpError(502, "Não foi possível processar a imagem. Tente novamente ou com outra foto.");
    }
  } else {
    essayText = parsedFields.data.text as string;
  }

  const grading = await gradeEssayManually({
    tenantId: user.tenantId,
    membershipId: user.id,
    essayText,
    studentLabel: parsedFields.data.studentLabel,
    overallScore: parsedFields.data.overallScore,
    overallMaxScore: parsedFields.data.overallMaxScore,
    annotations: parsedFields.data.annotations,
    studentFeedback: parsedFields.data.studentFeedback,
  });

  return apiSuccess(grading);
});
