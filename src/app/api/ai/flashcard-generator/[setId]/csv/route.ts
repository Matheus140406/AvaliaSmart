import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getFlashcardSet, toAnkiCsv } from "@/services/ai/flashcard-generator.service";

type RouteContext = { params: Promise<{ setId: string }> };

/**
 * GET /api/ai/flashcard-generator/[setId]/csv — exporta o conjunto de
 * flashcards já gerado em CSV importável no Anki ("Notas em Texto Simples",
 * campos separados por `;`, uma linha por card). Gerado sob demanda a
 * partir do conteúdo já persistido — não chama a IA de novo.
 */
export const GET = withTenant<RouteContext>(async (_request: NextRequest, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para exportar flashcards.");
  }

  const { setId } = await context.params;
  const set = await getFlashcardSet(user.tenantId, setId);
  const csv = toAnkiCsv(set.content);

  const safeName = set.title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").toLowerCase();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flashcards-${safeName}.csv"`,
    },
  });
});
