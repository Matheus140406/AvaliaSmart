import { withTenant } from "@/lib/with-tenant";
import { requireAiFeature } from "@/services/ai/guard";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { describeImage } from "@/services/ai/image-description.service";

/**
 * POST /api/ai/image-description — Etapa 7 da expansão de produtividade
 * docente. Sempre imagem (multipart/form-data, campo `image`) — não faz
 * sentido um XOR com texto colado aqui, já que o objetivo é descrever um
 * elemento visual.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerar descrição de imagem.");
  }

  const accessBlock = await requireAiFeature(user.tenantId, "imageDescription");
  if (accessBlock) return accessBlock;

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

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await describeImage({
    tenantId: user.tenantId,
    membershipId: user.id,
    imageBase64: buffer.toString("base64"),
    mediaType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
  });

  return apiSuccess(result);
});
