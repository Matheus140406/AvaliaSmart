import { prisma } from "@/lib/prisma";
import { computeWeightedAverage, classifyAverage } from "@/lib/grades/calculations";
import type { GradeConfigDTO } from "@/types/grade-grid";

export interface SubjectPerformance {
  subjectName: string;
  currentAverage: number | null;
  previousAverage: number | null;
  deltaPct: number | null; // (current - previous) / previous * 100
}

export interface StudentFlag {
  name: string;
  studentId: string;
  average: number | null;
  attendancePct: number;
}

export interface ClassPerformanceData {
  className: string;
  termName: string;
  previousTermName: string | null;
  subjects: SubjectPerformance[];
  classAttendancePct: number;
  studentsBelowAverage: StudentFlag[];
  studentsLowAttendance: StudentFlag[];
  /** Roster completo (não filtrado) — usado pela predição de risco, que precisa avaliar TODOS os alunos, não só os já flagged por um dos dois critérios isolados acima. */
  allStudents: StudentFlag[];
  totalStudents: number;
}

export interface StudentPerformanceData {
  studentName: string;
  termName: string;
  previousTermName: string | null;
  subjects: SubjectPerformance[];
  attendancePct: number;
}

/** Termo anterior (mesma trilha do ano letivo, por `order`) — usado pra "evolução". */
async function findPreviousTerm(academicYearId: string, currentOrder: number) {
  return prisma.term.findFirst({
    where: { academicYearId, order: { lt: currentOrder } },
    orderBy: { order: "desc" },
  });
}

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

async function computeStudentAverage(
  enrollmentId: string,
  classSubjectId: string,
  termId: string,
  gradeConfigsBySubjectTerm: Map<string, GradeConfigDTO[]>,
  gradesByEnrollment: Map<string, Map<string, number | null>>
): Promise<number | null> {
  const configs = gradeConfigsBySubjectTerm.get(`${classSubjectId}:${termId}`) ?? [];
  const valuesByConfig = gradesByEnrollment.get(enrollmentId) ?? new Map();
  const { average } = computeWeightedAverage(configs, (id) => valuesByConfig.get(id) ?? null);
  return average;
}

/** Verifica que `classId` pertence ao tenant — chamado ANTES de qualquer agregação. */
export async function assertClassInTenant(tenantId: string, classId: string) {
  const classRecord = await prisma.class.findUnique({ where: { id: classId }, include: { academicYear: true } });
  if (!classRecord || classRecord.tenantId !== tenantId) return null;
  return classRecord;
}

export async function assertStudentInTenant(tenantId: string, studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.tenantId !== tenantId) return null;
  return student;
}

export async function getClassPerformanceData(
  tenantId: string,
  classId: string,
  termId: string
): Promise<ClassPerformanceData | null> {
  const classRecord = await assertClassInTenant(tenantId, classId);
  if (!classRecord) return null;

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term || term.academicYearId !== classRecord.academicYearId) return null;

  const previousTerm = await findPreviousTerm(term.academicYearId, term.order);
  const termIds = [term.id, previousTerm?.id].filter((v): v is string => Boolean(v));

  const classSubjects = await prisma.classSubject.findMany({
    where: { classId },
    include: { subject: true },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { classId, status: "ATIVA" },
    include: {
      student: { select: { name: true } },
      grades: { where: { termId: { in: termIds } } },
      attendances: true,
    },
  });

  const gradeConfigs = await prisma.gradeConfig.findMany({
    where: { classSubjectId: { in: classSubjects.map((cs) => cs.id) }, termId: { in: termIds } },
    include: { type: true },
  });

  const gradeConfigsBySubjectTerm = new Map<string, GradeConfigDTO[]>();
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
    gradeConfigsBySubjectTerm.set(key, [...(gradeConfigsBySubjectTerm.get(key) ?? []), dto]);
  }

  const gradesByEnrollment = new Map<string, Map<string, number | null>>();
  for (const e of enrollments) {
    const m = new Map<string, number | null>();
    for (const g of e.grades) m.set(g.gradeConfigId, g.value !== null ? Number(g.value) : null);
    gradesByEnrollment.set(e.id, m);
  }

  const subjects: SubjectPerformance[] = [];
  for (const cs of classSubjects) {
    const currentAverages: number[] = [];
    const previousAverages: number[] = [];
    for (const e of enrollments) {
      const cur = await computeStudentAverage(e.id, cs.id, term.id, gradeConfigsBySubjectTerm, gradesByEnrollment);
      if (cur !== null) currentAverages.push(cur);
      if (previousTerm) {
        const prev = await computeStudentAverage(e.id, cs.id, previousTerm.id, gradeConfigsBySubjectTerm, gradesByEnrollment);
        if (prev !== null) previousAverages.push(prev);
      }
    }
    const currentAverage = averageOf(currentAverages);
    const previousAverage = previousTerm ? averageOf(previousAverages) : null;
    subjects.push({
      subjectName: cs.subject.name,
      currentAverage,
      previousAverage,
      deltaPct: deltaPct(currentAverage, previousAverage),
    });
  }

  const allAttendances = enrollments.flatMap((e) => e.attendances);
  const classAttendancePct =
    allAttendances.length > 0
      ? (allAttendances.filter((a) => a.present || a.justified).length / allAttendances.length) * 100
      : 100;

  const studentFlags: StudentFlag[] = enrollments.map((e) => {
    const attendances = e.attendances;
    const attendancePct =
      attendances.length > 0
        ? (attendances.filter((a) => a.present || a.justified).length / attendances.length) * 100
        : 100;
    return { name: e.student.name, studentId: e.studentId, average: null, attendancePct };
  });

  // Média geral do aluno (todas as disciplinas, termo atual) — pra flag de "abaixo da média".
  for (let i = 0; i < enrollments.length; i++) {
    const e = enrollments[i];
    const perSubject: number[] = [];
    for (const cs of classSubjects) {
      const avg = await computeStudentAverage(e.id, cs.id, term.id, gradeConfigsBySubjectTerm, gradesByEnrollment);
      if (avg !== null) perSubject.push(avg);
    }
    studentFlags[i].average = averageOf(perSubject);
  }

  const studentsBelowAverage = studentFlags
    .filter((s) => s.average !== null && classifyAverage(s.average, 1) !== "aprovado")
    .slice(0, 15);
  const studentsLowAttendance = studentFlags.filter((s) => s.attendancePct < 75).slice(0, 15);

  return {
    className: classRecord.name,
    termName: term.name,
    previousTermName: previousTerm?.name ?? null,
    subjects,
    classAttendancePct,
    studentsBelowAverage,
    studentsLowAttendance,
    allStudents: studentFlags,
    totalStudents: enrollments.length,
  };
}

export async function getStudentPerformanceData(
  tenantId: string,
  studentId: string,
  termId: string
): Promise<StudentPerformanceData | null> {
  const student = await assertStudentInTenant(tenantId, studentId);
  if (!student) return null;

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: "ATIVA" },
    include: { class: { include: { academicYear: true, classSubjects: { include: { subject: true } } } } },
  });
  if (!enrollment) return null;

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term || term.academicYearId !== enrollment.class.academicYearId) return null;

  const previousTerm = await findPreviousTerm(term.academicYearId, term.order);
  const termIds = [term.id, previousTerm?.id].filter((v): v is string => Boolean(v));

  const classSubjects = enrollment.class.classSubjects;
  const gradeConfigs = await prisma.gradeConfig.findMany({
    where: { classSubjectId: { in: classSubjects.map((cs) => cs.id) }, termId: { in: termIds } },
    include: { type: true },
  });
  const gradeConfigsBySubjectTerm = new Map<string, GradeConfigDTO[]>();
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
    gradeConfigsBySubjectTerm.set(key, [...(gradeConfigsBySubjectTerm.get(key) ?? []), dto]);
  }

  const grades = await prisma.grade.findMany({
    where: { enrollmentId: enrollment.id, termId: { in: termIds } },
  });
  const valuesByConfig = new Map<string, number | null>();
  for (const g of grades) valuesByConfig.set(g.gradeConfigId, g.value !== null ? Number(g.value) : null);
  const gradesByEnrollment = new Map([[enrollment.id, valuesByConfig]]);

  const subjects: SubjectPerformance[] = [];
  for (const cs of classSubjects) {
    const currentAverage = await computeStudentAverage(enrollment.id, cs.id, term.id, gradeConfigsBySubjectTerm, gradesByEnrollment);
    const previousAverage = previousTerm
      ? await computeStudentAverage(enrollment.id, cs.id, previousTerm.id, gradeConfigsBySubjectTerm, gradesByEnrollment)
      : null;
    subjects.push({
      subjectName: cs.subject.name,
      currentAverage,
      previousAverage,
      deltaPct: deltaPct(currentAverage, previousAverage),
    });
  }

  const attendances = await prisma.attendance.findMany({ where: { enrollmentId: enrollment.id } });
  const attendancePct =
    attendances.length > 0
      ? (attendances.filter((a) => a.present || a.justified).length / attendances.length) * 100
      : 100;

  return {
    studentName: student.name,
    termName: term.name,
    previousTermName: previousTerm?.name ?? null,
    subjects,
    attendancePct,
  };
}

/**
 * Fingerprint barato do dado subjacente — muda sempre que uma nota do
 * escopo/termo é criada/editada (import ou lançamento manual). Usado pra
 * invalidar o cache do resumo de IA sem precisar de um evento explícito de
 * "dado mudou".
 */
export async function computeDataVersion(termId: string, enrollmentIds: string[]): Promise<string> {
  if (enrollmentIds.length === 0) return "empty";
  const agg = await prisma.grade.aggregate({
    where: { termId, enrollmentId: { in: enrollmentIds } },
    _count: true,
    _max: { updatedAt: true },
  });
  return `${agg._count}:${agg._max.updatedAt?.toISOString() ?? "none"}`;
}

export async function getEnrollmentIdsForClass(classId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({ where: { classId, status: "ATIVA" }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function getEnrollmentIdsForStudent(studentId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({ where: { studentId, status: "ATIVA" }, select: { id: true } });
  return rows.map((r) => r.id);
}
