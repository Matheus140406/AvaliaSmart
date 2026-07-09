import { randomUUID } from "node:crypto";
import { Prisma, type MembershipRole } from "@prisma/client";
import type { NextResponse } from "next/server";
import { requireStudentCapacity } from "@/lib/billing/guard";
import { badRequest, notFound, forbidden } from "@/lib/http/errors";
import { findClassSubjectWithClass } from "@/repositories/class-subject.repository";
import {
  findImportHistoryByIdempotencyKey,
  findTermById,
  findValidGradeConfigIds,
  findStudentsByRegistrationOrName,
  findEnrollmentsForStudents,
  findExistingGradeKeys,
  commitImportTransaction,
  type NewStudentInput,
  type ImportCommitResult,
} from "@/repositories/import.repository";

/**
 * Extraído de app/api/import/commit/route.ts (Etapa B1). Mantém as três
 * garantias da v2 dessa rota: idempotência real via constraint única em
 * ImportHistory, bulk de verdade (pré-carrega tudo, resolve em memória,
 * escreve em lotes) e audit log por commit bem-sucedido.
 */

export interface MappedImportRow {
  rowIndex: number;
  studentName: string | null;
  registrationCode: string | null;
  grades: Record<string, number | null>;
}

export interface CommitImportParams {
  tenantId: string;
  membershipId: string;
  role: MembershipRole;
  classId: string;
  classSubjectId: string;
  termId: string;
  idempotencyKey: string;
  fileName?: string;
  rows: MappedImportRow[];
}

function toIdempotentResult(h: {
  rowsProcessed: number;
  studentsCreated: number;
  gradesCreated: number;
  gradesUpdated: number;
}): ImportCommitResult & { idempotent: true } {
  return {
    idempotent: true,
    rowsProcessed: h.rowsProcessed,
    studentsImported: h.studentsCreated,
    gradesCreated: h.gradesCreated,
    gradesUpdated: h.gradesUpdated,
  };
}

/**
 * Retorna a `NextResponse` de bloqueio (teto de alunos do plano) diretamente
 * quando aplicável — mesma convenção de `requireAiAccess`/`requireOcrCapacity`
 * usada nas outras rotas guardadas por plano. Aqui o teto só é conhecido
 * depois de resolver quais linhas vão CRIAR aluno novo, por isso o guard roda
 * no meio do fluxo em vez de no topo da rota.
 */
export async function commitImport(
  params: CommitImportParams
): Promise<NextResponse | (ImportCommitResult & { idempotent: boolean })> {
  const alreadyProcessed = await findImportHistoryByIdempotencyKey(params.idempotencyKey);
  if (alreadyProcessed) return toIdempotentResult(alreadyProcessed);

  const rowsWithoutName = params.rows.filter((r) => !r.studentName || r.studentName.trim() === "");
  if (rowsWithoutName.length > 0) {
    throw badRequest(`${rowsWithoutName.length} linha(s) sem nome de aluno. Corrija e reenvie.`);
  }

  // ClassSubject/Term/GradeConfig não têm tenantId direto (são escopados via
  // relação) — a Client Extension não cobre esses, então o check aqui
  // continua explícito, de propósito.
  const classSubject = await findClassSubjectWithClass(params.classSubjectId);
  if (!classSubject || classSubject.class.tenantId !== params.tenantId) {
    throw notFound("Turma/disciplina não encontrada.");
  }
  if (classSubject.classId !== params.classId) {
    throw badRequest("classId não corresponde à turma da disciplina informada.");
  }
  if (params.role === "PROFESSOR" && classSubject.teacherId !== params.membershipId) {
    throw forbidden("Você não leciona essa disciplina/turma.");
  }

  const term = await findTermById(params.termId);
  // IDOR corrigido (achado na auditoria): sem isto, um termId de OUTRO
  // tenant (ou de outro ano letivo do mesmo tenant) seria aceito de boa — a
  // checagem certa é academicYear, não só tenant.
  if (!term || term.academicYearId !== classSubject.class.academicYearId) {
    throw notFound("Período (bimestre/trimestre) não encontrado para esta turma.");
  }

  const referencedConfigIds = [...new Set(params.rows.flatMap((r) => Object.keys(r.grades)))];
  const validConfigs = await findValidGradeConfigIds(referencedConfigIds, params.classSubjectId, params.termId);
  const validConfigIds = new Set(validConfigs.map((c) => c.id));

  // -------------------------------------------------------------------
  // Pré-carrega o que já existe (Students) e resolve cada linha pra um
  // studentId (existente ou recém-gerado), separando quem precisa ser criado.
  // -------------------------------------------------------------------

  const registrationCodes = [
    ...new Set(params.rows.map((r) => r.registrationCode?.trim()).filter((v): v is string => Boolean(v))),
  ];
  const namesWithoutRegistration = [
    ...new Set(params.rows.filter((r) => !r.registrationCode?.trim()).map((r) => r.studentName!.trim())),
  ];
  const existingStudents = await findStudentsByRegistrationOrName(registrationCodes, namesWithoutRegistration);

  const studentByRegistration = new Map(
    existingStudents.filter((s) => s.registrationCode).map((s) => [s.registrationCode as string, s])
  );
  const studentByName = new Map(existingStudents.map((s) => [s.name, s]));

  const newStudents: NewStudentInput[] = [];
  const resolvedRows: { row: MappedImportRow; studentId: string }[] = [];

  for (const row of params.rows) {
    const registrationCode = row.registrationCode?.trim() || null;
    const name = row.studentName!.trim();

    const existing = registrationCode ? studentByRegistration.get(registrationCode) : studentByName.get(name);
    if (existing) {
      resolvedRows.push({ row, studentId: existing.id });
      continue;
    }

    // Pode ser a 2ª+ ocorrência do mesmo aluno na própria planilha — reusa o
    // id já gerado em vez de criar duplicado.
    const dedupeKey = registrationCode ?? name;
    const alreadyQueued = registrationCode ? studentByRegistration.get(dedupeKey) : studentByName.get(dedupeKey);
    if (alreadyQueued) {
      resolvedRows.push({ row, studentId: alreadyQueued.id });
      continue;
    }

    const id = randomUUID();
    newStudents.push({ id, tenantId: params.tenantId, name, registrationCode });
    const stub = { id, name, registrationCode } as (typeof existingStudents)[number];
    if (registrationCode) studentByRegistration.set(registrationCode, stub);
    else studentByName.set(name, stub);
    resolvedRows.push({ row, studentId: id });
  }

  // Checagem de teto do plano: só as linhas que vão CRIAR aluno novo contam
  // contra o limite — reimportar notas de alunos existentes não pode ser
  // bloqueado por teto (senão o professor não consegue nem corrigir nota).
  const capacityBlock = await requireStudentCapacity(params.tenantId, newStudents.length);
  if (capacityBlock) return capacityBlock;

  // -------------------------------------------------------------------
  // Enrollments: mesma lógica — pré-carrega, resolve em memória.
  // -------------------------------------------------------------------

  const academicYearId = classSubject.class.academicYearId;
  const studentIds = [...new Set(resolvedRows.map((r) => r.studentId))];

  const existingEnrollments = await findEnrollmentsForStudents(params.classId, academicYearId, studentIds);
  const enrollmentByStudentId = new Map(existingEnrollments.map((e) => [e.studentId, e]));

  const newEnrollments: { id: string; studentId: string; classId: string; academicYearId: string }[] = [];
  for (const studentId of studentIds) {
    if (!enrollmentByStudentId.has(studentId)) {
      const id = randomUUID();
      newEnrollments.push({ id, studentId, classId: params.classId, academicYearId });
      enrollmentByStudentId.set(studentId, { id, studentId } as (typeof existingEnrollments)[number]);
    }
  }

  // -------------------------------------------------------------------
  // Grades: monta a lista final e separa create vs. update comparando com
  // o que já existe (1 findMany em vez de 1 upsert por nota).
  // -------------------------------------------------------------------

  const gradeEntries: { enrollmentId: string; gradeConfigId: string; value: number }[] = [];
  for (const { row, studentId } of resolvedRows) {
    const enrollmentId = enrollmentByStudentId.get(studentId)!.id;
    for (const [gradeConfigId, value] of Object.entries(row.grades)) {
      if (value === null || !validConfigIds.has(gradeConfigId)) continue;
      gradeEntries.push({ enrollmentId, gradeConfigId, value });
    }
  }

  const enrollmentIdsForGrades = [...new Set(gradeEntries.map((g) => g.enrollmentId))];
  const existingGrades = await findExistingGradeKeys(enrollmentIdsForGrades, [...validConfigIds]);
  const existingGradeKeys = new Set(existingGrades.map((g) => `${g.enrollmentId}:${g.gradeConfigId}`));

  const gradesToCreate = gradeEntries.filter((g) => !existingGradeKeys.has(`${g.enrollmentId}:${g.gradeConfigId}`));
  const gradesToUpdate = gradeEntries.filter((g) => existingGradeKeys.has(`${g.enrollmentId}:${g.gradeConfigId}`));

  try {
    const result = await commitImportTransaction({
      tenantId: params.tenantId,
      membershipId: params.membershipId,
      classId: params.classId,
      classSubjectId: params.classSubjectId,
      termId: params.termId,
      fileName: params.fileName,
      idempotencyKey: params.idempotencyKey,
      rowsCount: params.rows.length,
      newStudents,
      newEnrollments,
      gradesToCreate,
      gradesToUpdate,
    });
    return { ...result, idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Alguém ganhou a corrida com a mesma idempotencyKey enquanto
      // processávamos — devolve o resultado da requisição que venceu.
      const winner = await findImportHistoryByIdempotencyKey(params.idempotencyKey);
      if (winner) return toIdempotentResult(winner);
    }
    throw error;
  }
}
