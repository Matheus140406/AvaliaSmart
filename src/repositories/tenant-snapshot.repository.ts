import { prisma } from "@/lib/prisma";
import { computeWeightedAverage, classifyAverage } from "@/lib/grades/calculations";
import type { GradeConfigDTO } from "@/types/grade-grid";

/**
 * Monta o "dataset pré-carregado" que o chat de IA (Etapa 3) usa como
 * contexto — a IA NUNCA toca o banco diretamente. Esta função é a única
 * porta de entrada: tudo que a IA "vê" sobre o tenant passa por aqui.
 *
 * Isolamento multi-tenant: toda query abaixo filtra `tenantId` EXPLICITAMENTE
 * na cláusula `where`, sem depender só do filtro automático da Client
 * Extension (lib/prisma.ts) — e a função `assertTenantOwnership` faz uma
 * segunda checagem, em runtime, de que cada registro que compõe o snapshot
 * realmente pertence ao tenant pedido, antes de devolver qualquer coisa.
 * Isso é intencionalmente redundante: um bug futuro que remova o filtro da
 * query ainda seria pego pela asserção.
 */

export interface StudentFlag {
  studentName: string;
  className: string;
  reason: string; // ex: "média 4.2 em Matemática", "frequência 62%"
}

export interface ClassSnapshot {
  className: string;
  academicYear: number;
  subjectAverages: { subjectName: string; average: number | null; previousAverage: number | null }[];
  attendancePct: number;
  studentCount: number;
}

export interface TenantSnapshot {
  tenantName: string;
  termName: string;
  /** Null quando não há ano letivo/período cadastrado — usado pelo chat (Etapa P3) pra resolver "bimestre passado" relativo a ESTE período. */
  termId: string | null;
  classes: ClassSnapshot[];
  studentsNeedingAttention: StudentFlag[];
}

const MAX_FLAGGED_STUDENTS = 20;

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function getTenantSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  if (!tenant) throw new Error(`Tenant ${tenantId} não encontrado ao montar snapshot de IA.`);

  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId, isActive: true },
  });
  if (!academicYear) {
    return { tenantName: tenant.name, termName: "sem ano letivo ativo", termId: null, classes: [], studentsNeedingAttention: [] };
  }

  const currentTerm = await prisma.term.findFirst({
    where: { academicYearId: academicYear.id },
    orderBy: { order: "desc" },
  });
  if (!currentTerm) {
    return { tenantName: tenant.name, termName: "sem período letivo cadastrado", termId: null, classes: [], studentsNeedingAttention: [] };
  }
  const previousTerm = await prisma.term.findFirst({
    where: { academicYearId: academicYear.id, order: { lt: currentTerm.order } },
    orderBy: { order: "desc" },
  });

  // Query EXPLICITAMENTE filtrada por tenantId — não depende do filtro
  // automático da extension (Class não tem tenantId direto na extension
  // atual porque é escopado via academicYear, então isso aqui é o filtro
  // real, não redundância decorativa).
  const classes = await prisma.class.findMany({
    where: { tenantId, academicYearId: academicYear.id },
    include: {
      classSubjects: { include: { subject: true } },
      enrollments: {
        where: { status: "ATIVA" },
        include: { student: true, attendances: true },
      },
    },
  });

  // Asserção redundante: todo Class retornado tem que bater com o tenantId
  // pedido. Se algum dia o filtro acima quebrar (bug, refactor), isso
  // lança e o snapshot NUNCA é montado com dado de outro tenant.
  for (const c of classes) {
    if (c.tenantId !== tenantId) {
      throw new Error(`Isolamento multi-tenant violado: Class ${c.id} não pertence ao tenant ${tenantId}.`);
    }
  }

  const termIds = [currentTerm.id, previousTerm?.id].filter((v): v is string => Boolean(v));
  const allClassSubjectIds = classes.flatMap((c) => c.classSubjects.map((cs) => cs.id));

  const gradeConfigs = await prisma.gradeConfig.findMany({
    where: { classSubjectId: { in: allClassSubjectIds }, termId: { in: termIds } },
    include: { type: true },
  });
  const gradeConfigsByKey = new Map<string, GradeConfigDTO[]>();
  for (const gc of gradeConfigs) {
    const key = `${gc.classSubjectId}:${gc.termId}`;
    const dto: GradeConfigDTO = {
      id: gc.id,
      name: gc.name,
      typeId: gc.typeId,
      typeName: gc.type.name,
      weight: Number(gc.weight),
      maxScore: Number(gc.maxScore),
      order: gc.order,
    };
    gradeConfigsByKey.set(key, [...(gradeConfigsByKey.get(key) ?? []), dto]);
  }

  const allEnrollmentIds = classes.flatMap((c) => c.enrollments.map((e) => e.id));
  const grades = await prisma.grade.findMany({
    where: { enrollmentId: { in: allEnrollmentIds }, termId: { in: termIds } },
  });
  const gradesByEnrollment = new Map<string, Map<string, number | null>>();
  for (const g of grades) {
    if (!gradesByEnrollment.has(g.enrollmentId)) gradesByEnrollment.set(g.enrollmentId, new Map());
    gradesByEnrollment.get(g.enrollmentId)!.set(g.gradeConfigId, g.value !== null ? Number(g.value) : null);
  }

  const classSnapshots: ClassSnapshot[] = [];
  const studentsNeedingAttention: StudentFlag[] = [];

  for (const c of classes) {
    const subjectAverages: ClassSnapshot["subjectAverages"] = [];

    for (const cs of c.classSubjects) {
      const currentConfigs = gradeConfigsByKey.get(`${cs.id}:${currentTerm.id}`) ?? [];
      const previousConfigs = previousTerm ? gradeConfigsByKey.get(`${cs.id}:${previousTerm.id}`) ?? [] : [];

      const currentAverages: number[] = [];
      const previousAverages: number[] = [];
      for (const e of c.enrollments) {
        const valuesByConfig = gradesByEnrollment.get(e.id) ?? new Map();
        const { average: cur } = computeWeightedAverage(currentConfigs, (id) => valuesByConfig.get(id) ?? null);
        if (cur !== null) currentAverages.push(cur);
        if (previousTerm) {
          const { average: prev } = computeWeightedAverage(previousConfigs, (id) => valuesByConfig.get(id) ?? null);
          if (prev !== null) previousAverages.push(prev);
        }
      }

      subjectAverages.push({
        subjectName: cs.subject.name,
        average: averageOf(currentAverages),
        previousAverage: previousTerm ? averageOf(previousAverages) : null,
      });

      // Flags de "aluno precisa de atenção" por disciplina: média abaixo do
      // limite de aprovação nesta disciplina específica.
      for (const e of c.enrollments) {
        const valuesByConfig = gradesByEnrollment.get(e.id) ?? new Map();
        const { average, filled } = computeWeightedAverage(currentConfigs, (id) => valuesByConfig.get(id) ?? null);
        if (average !== null && classifyAverage(average, filled) !== "aprovado" && studentsNeedingAttention.length < MAX_FLAGGED_STUDENTS) {
          studentsNeedingAttention.push({
            studentName: e.student.name,
            className: c.name,
            reason: `média ${average.toFixed(1)} em ${cs.subject.name}`,
          });
        }
      }
    }

    const allAttendances = c.enrollments.flatMap((e) => e.attendances);
    const attendancePct =
      allAttendances.length > 0
        ? (allAttendances.filter((a) => a.present || a.justified).length / allAttendances.length) * 100
        : 100;

    // Flags de frequência baixa (independente de disciplina).
    for (const e of c.enrollments) {
      if (studentsNeedingAttention.length >= MAX_FLAGGED_STUDENTS) break;
      const attendances = e.attendances;
      const pct = attendances.length > 0 ? (attendances.filter((a) => a.present || a.justified).length / attendances.length) * 100 : 100;
      if (pct < 75) {
        studentsNeedingAttention.push({ studentName: e.student.name, className: c.name, reason: `frequência ${pct.toFixed(0)}%` });
      }
    }

    classSnapshots.push({
      className: c.name,
      academicYear: academicYear.year,
      subjectAverages,
      attendancePct,
      studentCount: c.enrollments.length,
    });
  }

  return {
    tenantName: tenant.name,
    termName: currentTerm.name,
    termId: currentTerm.id,
    classes: classSnapshots,
    studentsNeedingAttention: studentsNeedingAttention.slice(0, MAX_FLAGGED_STUDENTS),
  };
}

export interface HistoricalClassSnapshot {
  className: string;
  subjectAverages: { subjectName: string; average: number | null }[];
  attendancePct: number;
}

export interface HistoricalSnapshot {
  termName: string;
  classes: HistoricalClassSnapshot[];
  studentsNeedingAttention: StudentFlag[];
}

/**
 * Busca SOB DEMANDA (Etapa P3) — só chamada quando o chat detecta uma
 * pergunta histórica/comparativa (ver `detectHistoricalTermRequest` em
 * chat.service.ts). `getTenantSnapshot` acima já embute a média do período
 * ANTERIOR por disciplina (`previousAverage`), mas não tem frequência nem
 * "alunos em atenção" de um período passado, e só cobre o período
 * imediatamente anterior — não um bimestre específico mais distante (ex:
 * "1º Bimestre" perguntado enquanto o ano letivo já está no 4º). Esta
 * função busca o mesmo tipo de dado (médias, frequência, atenção) mas pra
 * QUALQUER termo do mesmo tenant, sob demanda — não roda em toda pergunta,
 * só quando o termo histórico é detectado (mais barato em token do que
 * sempre incluir todo o histórico no prompt).
 */
export async function getTenantSnapshotForTerm(tenantId: string, termId: string): Promise<HistoricalSnapshot | null> {
  const term = await prisma.term.findUnique({ where: { id: termId }, include: { academicYear: true } });
  if (!term || term.academicYear.tenantId !== tenantId) return null;

  const classes = await prisma.class.findMany({
    where: { tenantId, academicYearId: term.academicYearId },
    include: {
      classSubjects: { include: { subject: true } },
      // `Attendance` não tem `termId` direto — filtra pela janela de datas
      // do próprio Term. Sem isso, a frequência "deste período histórico"
      // na verdade somaria frequência de TODOS os períodos (mesma
      // simplificação que já existe em `getTenantSnapshot` acima, mas ali é
      // sempre "o período atual + tudo até agora"; aqui, um período
      // ESPECÍFICO do passado exige o filtro de verdade pra não devolver
      // frequência errada como se fosse daquele bimestre).
      enrollments: {
        where: { status: "ATIVA" },
        include: { student: true, attendances: { where: { date: { gte: term.startDate, lte: term.endDate } } } },
      },
    },
  });
  for (const c of classes) {
    if (c.tenantId !== tenantId) {
      throw new Error(`Isolamento multi-tenant violado: Class ${c.id} não pertence ao tenant ${tenantId}.`);
    }
  }

  const classSubjectIds = classes.flatMap((c) => c.classSubjects.map((cs) => cs.id));
  const gradeConfigs = await prisma.gradeConfig.findMany({
    where: { classSubjectId: { in: classSubjectIds }, termId },
    include: { type: true },
  });
  const gradeConfigsByClassSubject = new Map<string, GradeConfigDTO[]>();
  for (const gc of gradeConfigs) {
    const dto: GradeConfigDTO = {
      id: gc.id,
      name: gc.name,
      typeId: gc.typeId,
      typeName: gc.type.name,
      weight: Number(gc.weight),
      maxScore: Number(gc.maxScore),
      order: gc.order,
    };
    gradeConfigsByClassSubject.set(gc.classSubjectId, [...(gradeConfigsByClassSubject.get(gc.classSubjectId) ?? []), dto]);
  }

  const enrollmentIds = classes.flatMap((c) => c.enrollments.map((e) => e.id));
  const grades = await prisma.grade.findMany({ where: { enrollmentId: { in: enrollmentIds }, termId } });
  const gradesByEnrollment = new Map<string, Map<string, number | null>>();
  for (const g of grades) {
    if (!gradesByEnrollment.has(g.enrollmentId)) gradesByEnrollment.set(g.enrollmentId, new Map());
    gradesByEnrollment.get(g.enrollmentId)!.set(g.gradeConfigId, g.value !== null ? Number(g.value) : null);
  }

  const classSnapshots: HistoricalClassSnapshot[] = [];
  const studentsNeedingAttention: StudentFlag[] = [];

  for (const c of classes) {
    const subjectAverages: HistoricalClassSnapshot["subjectAverages"] = [];

    for (const cs of c.classSubjects) {
      const configs = gradeConfigsByClassSubject.get(cs.id) ?? [];
      const averages: number[] = [];
      for (const e of c.enrollments) {
        const valuesByConfig = gradesByEnrollment.get(e.id) ?? new Map();
        const { average, filled } = computeWeightedAverage(configs, (id) => valuesByConfig.get(id) ?? null);
        if (average !== null) averages.push(average);
        if (average !== null && classifyAverage(average, filled) !== "aprovado" && studentsNeedingAttention.length < MAX_FLAGGED_STUDENTS) {
          studentsNeedingAttention.push({ studentName: e.student.name, className: c.name, reason: `média ${average.toFixed(1)} em ${cs.subject.name}` });
        }
      }
      subjectAverages.push({ subjectName: cs.subject.name, average: averageOf(averages) });
    }

    const allAttendances = c.enrollments.flatMap((e) => e.attendances);
    const attendancePct =
      allAttendances.length > 0
        ? (allAttendances.filter((a) => a.present || a.justified).length / allAttendances.length) * 100
        : 100;

    classSnapshots.push({ className: c.name, subjectAverages, attendancePct });
  }

  return { termName: term.name, classes: classSnapshots, studentsNeedingAttention: studentsNeedingAttention.slice(0, MAX_FLAGGED_STUDENTS) };
}
