import type { MembershipRole } from "@prisma/client";
import { extractGradeSheetFromImage } from "@/lib/ocr/extract-grade-sheet";
import { recordOcrUsage } from "@/lib/billing/guard";
import { notFound, forbidden, HttpError } from "@/lib/http/errors";
import { findClassSubjectWithClass } from "@/repositories/class-subject.repository";
import { findGradeConfigNames, findActiveEnrollmentsWithStudentNames } from "@/repositories/ocr.repository";
import type { ParsedSpreadsheet } from "@/types/import";

export interface ProcessGradeSheetImageParams {
  tenantId: string;
  role: MembershipRole;
  membershipId: string;
  classSubjectId: string;
  termId: string;
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  fileName: string;
}

export async function processGradeSheetImage(params: ProcessGradeSheetImageParams): Promise<ParsedSpreadsheet> {
  const classSubject = await findClassSubjectWithClass(params.classSubjectId);
  if (!classSubject || classSubject.class.tenantId !== params.tenantId) {
    throw notFound("Turma/disciplina não encontrada.");
  }
  if (params.role === "PROFESSOR" && classSubject.teacherId !== params.membershipId) {
    throw forbidden("Você não leciona essa disciplina/turma.");
  }

  const [gradeConfigs, enrollments] = await Promise.all([
    findGradeConfigNames(params.classSubjectId, params.termId),
    findActiveEnrollmentsWithStudentNames(classSubject.classId),
  ]);

  let extracted;
  try {
    extracted = await extractGradeSheetFromImage(params.imageBase64, params.mimeType, {
      studentNames: enrollments.map((e) => e.student.name),
      evaluationNames: gradeConfigs.map((gc) => gc.name),
    });
  } catch (err) {
    // Erro da IA/provider — logado por inteiro no servidor; ao cliente só a
    // mensagem curta (evita vazar detalhe interno do provider).
    console.error("[ocr] falha ao extrair tabela da imagem:", err);
    throw new HttpError(502, "Não foi possível processar a imagem. Tente novamente ou com outra foto.");
  }

  await recordOcrUsage(params.tenantId);

  return {
    fileName: params.fileName,
    headers: extracted.headers,
    rows: extracted.rows.map((values) => {
      const record: Record<string, string | number | null> = {};
      extracted.headers.forEach((header, idx) => {
        record[header] = values[idx] ?? null;
      });
      return record;
    }),
  };
}
