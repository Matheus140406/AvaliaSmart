import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requireAiFeature } from "@/services/ai/guard";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden, HttpError } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { extractDocumentTextFromImage } from "@/lib/ocr/extract-document-text";
import { generateFlashcards } from "@/services/ai/flashcard-generator.service";

/**
 * POST /api/ai/flashcard-generator — Etapa 2 da expansão de produtividade
 * docente. Mesmo contrato de entrada do Gerador de Provas (Etapa 1):
 * multipart/form-data com EXATAMENTE um dos dois, `text` ou `image`.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const fieldsSchema = z.object({
  text: z.string().trim().min(1).optional(),
  subjectHint: z.string().trim().max(200).optional(),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerar flashcards.");
  }

  const accessBlock = await requireAiFeature(user.tenantId, "flashcards");
  if (accessBlock) return accessBlock;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    throw badRequest("Requisição deve ser multipart/form-data.");
  }

  const parsedFields = fieldsSchema.safeParse({
    text: formData.get("text") ?? undefined,
    subjectHint: formData.get("subjectHint") ?? undefined,
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

  let sourceText: string;
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
      sourceText = await extractDocumentTextFromImage(
        buffer.toString("base64"),
        image.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif"
      );
    } catch (err) {
      console.error("[flashcard-generator] falha ao extrair texto da imagem:", err);
      throw new HttpError(502, "Não foi possível processar a imagem. Tente novamente ou com outra foto.");
    }
  } else {
    sourceText = parsedFields.data.text as string;
  }

  const flashcards = await generateFlashcards({
    tenantId: user.tenantId,
    membershipId: user.id,
    sourceText,
    subjectHint: parsedFields.data.subjectHint,
  });

  return apiSuccess(flashcards);
});
