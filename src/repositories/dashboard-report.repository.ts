import { prisma } from "@/lib/prisma";
import { computeWeightedAverage, classifyAverage, type GradeStatus } from "@/lib/grades/calculations";
import type { GradeConfigDTO } from "@/types/grade-grid";

export interface SubjectTrend {
  subjectName: string;
  termAverages: { termName: string; average: number | null }[];
}

export interface ClassReportRow {
  className: string;
  studentCount: number;
  attendancePct: number;
  subjects: SubjectTrend[];
}

export interface AttentionPoint {
  studentName: string;
  className: string;
  reason: string;
}

export interface RecentActivityItem {
  studentName: string;
  className: string;
  action: string;
  date: string;
  status: "concluido" | "pendente";
}

export interface DashboardReport {
  tenantName: string;
  academicYear: number | null;
  classes: ClassReportRow[];
  attentionPoints: AttentionPoint[];
  /** Contagem de matrículas ativas por status geral (média de TODAS as disciplinas no período mais recente) — base do donut "Situação dos alunos". */
  studentStatusCounts: Record<GradeStatus, number>;
  /** GradeConfig (itens de avaliação) criados no mês corrente — só existe a partir da migration que adicionou `createdAt` a GradeConfig; itens mais antigos não contam (criados antes do campo existir, backfilled com a data da migration). */
  assessmentsThisMonth: number;
  recentActivity: RecentActivityItem[];
}

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Relatório consolidado do tenant inteiro — mesmo escopo/RBAC das outras
 * rotas de export (tenant explícito na query, sem depender só do filtro
 * automático da Client Extension). "Evolução ao longo do tempo" aqui é
 * TODOS os períodos do ano letivo ativo (não só atual + anterior, como no
 * resumo de IA) — faz mais sentido numa tabela de relatório do que num
 * texto curto de resumo.
 */
export async function getDashboardReport(tenantId: string): Promise<DashboardReport> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  if (!tenant) throw new Error(`Tenant ${tenantId} não encontrado.`);

  const academicYear = await prisma.academicYear.findFirst({ where: { tenantId, isActive: true } });
  if (!academicYear) {
    return {
      tenantName: tenant.name,
      academicYear: null,
      classes: [],
      attentionPoints: [],
      studentStatusCounts: { aprovado: 0, recuperacao: 0, reprovado: 0, pendente: 0 },
      assessmentsThisMonth: 0,
      recentActivity: [],
    };
  }

  const terms = await prisma.term.findMany({
    where: { academicYearId: academicYear.id },
    orderBy: { order: "asc" },
  });

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
  for (const c of classes) {
    if (c.tenantId !== tenantId) {
      throw new Error(`Isolamento multi-tenant violado: Class ${c.id} não pertence ao tenant ${tenantId}.`);
    }
  }

  const termIds = terms.map((t) => t.id);
  const classSubjectIds = classes.flatMap((c) => c.classSubjects.map((cs) => cs.id));

  const gradeConfigs = await prisma.gradeConfig.findMany({
    where: { classSubjectId: { in: classSubjectIds }, termId: { in: termIds } },
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

  const enrollmentIds = classes.flatMap((c) => c.enrollments.map((e) => e.id));
  const grades = await prisma.grade.findMany({ where: { enrollmentId: { in: enrollmentIds }, termId: { in: termIds } } });
  const gradesByEnrollment = new Map<string, Map<string, number | null>>();
  for (const g of grades) {
    if (!gradesByEnrollment.has(g.enrollmentId)) gradesByEnrollment.set(g.enrollmentId, new Map());
    gradesByEnrollment.get(g.enrollmentId)!.set(g.gradeConfigId, g.value !== null ? Number(g.value) : null);
  }

  const classRows: ClassReportRow[] = [];
  const attentionPoints: AttentionPoint[] = [];
  const studentStatusCounts: Record<GradeStatus, number> = { aprovado: 0, recuperacao: 0, reprovado: 0, pendente: 0 };

  for (const c of classes) {
    const subjects: SubjectTrend[] = [];

    for (const cs of c.classSubjects) {
      const termAverages = terms.map((term) => {
        const configs = gradeConfigsByKey.get(`${cs.id}:${term.id}`) ?? [];
        const averages: number[] = [];
        for (const e of c.enrollments) {
          const valuesByConfig = gradesByEnrollment.get(e.id) ?? new Map();
          const { average } = computeWeightedAverage(configs, (id) => valuesByConfig.get(id) ?? null);
          if (average !== null) averages.push(average);
        }
        return { termName: term.name, average: averageOf(averages) };
      });
      subjects.push({ subjectName: cs.subject.name, termAverages });

      // Ponto de atenção: média abaixo de aprovado no período MAIS RECENTE com nota lançada.
      const lastConfigs = gradeConfigsByKey.get(`${cs.id}:${terms[terms.length - 1]?.id}`) ?? [];
      for (const e of c.enrollments) {
        const valuesByConfig = gradesByEnrollment.get(e.id) ?? new Map();
        const { average, filled } = computeWeightedAverage(lastConfigs, (id) => valuesByConfig.get(id) ?? null);
        if (average !== null && classifyAverage(average, filled) !== "aprovado") {
          attentionPoints.push({ studentName: e.student.name, className: c.name, reason: `média ${average.toFixed(1)} em ${cs.subject.name}` });
        }
      }
    }

    const allAttendances = c.enrollments.flatMap((e) => e.attendances);
    const attendancePct =
      allAttendances.length > 0
        ? (allAttendances.filter((a) => a.present || a.justified).length / allAttendances.length) * 100
        : 100;

    for (const e of c.enrollments) {
      const attendances = e.attendances;
      const pct = attendances.length > 0 ? (attendances.filter((a) => a.present || a.justified).length / attendances.length) * 100 : 100;
      if (pct < 75) attentionPoints.push({ studentName: e.student.name, className: c.name, reason: `frequência ${pct.toFixed(0)}%` });
    }

    // Status GERAL do aluno (todas as disciplinas, período mais recente) —
    // diferente do "ponto de atenção" acima (que é por disciplina/motivo);
    // aqui é uma classificação única por aluno, base do donut "Situação dos
    // alunos". Mesma convenção de período (último Term do ano letivo) já
    // usada nos pontos de atenção por nota.
    const lastTermId = terms[terms.length - 1]?.id;
    for (const e of c.enrollments) {
      const valuesByConfig = gradesByEnrollment.get(e.id) ?? new Map();
      const subjectAverages: number[] = [];
      let anyFilled = false;
      for (const cs of c.classSubjects) {
        const configs = gradeConfigsByKey.get(`${cs.id}:${lastTermId}`) ?? [];
        const { average, filled } = computeWeightedAverage(configs, (id) => valuesByConfig.get(id) ?? null);
        if (filled > 0) anyFilled = true;
        if (average !== null) subjectAverages.push(average);
      }
      const overall = averageOf(subjectAverages);
      studentStatusCounts[classifyAverage(overall, anyFilled ? 1 : 0)]++;
    }

    classRows.push({ className: c.name, studentCount: c.enrollments.length, attendancePct, subjects });
  }

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const assessmentsThisMonth = await prisma.gradeConfig.count({
    where: { classSubjectId: { in: classSubjectIds }, createdAt: { gte: startOfMonth } },
  });

  // Atividade recente = lançamento/edição de nota — fonte real (não
  // AuditLog, cujo JSON exigiria parse frágil por modelo); `Grade` já tem
  // as relações certas (aluno, turma, disciplina) prontas pra exibir.
  const recentGrades = await prisma.grade.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    include: {
      enrollment: { include: { student: true, class: true } },
      gradeConfig: { include: { classSubject: { include: { subject: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const recentActivity: RecentActivityItem[] = recentGrades.map((g) => ({
    studentName: g.enrollment.student.name,
    className: g.enrollment.class.name,
    action: `Nota lançada: ${g.gradeConfig.name} (${g.gradeConfig.classSubject.subject.name})`,
    date: g.updatedAt.toISOString(),
    status: g.value !== null ? "concluido" : "pendente",
  }));

  return {
    tenantName: tenant.name,
    academicYear: academicYear.year,
    classes: classRows,
    attentionPoints,
    studentStatusCounts,
    assessmentsThisMonth,
    recentActivity,
  };
}

// ---------------------------------------------------------------------------------------
// Resumo pro painel (JSON) — Etapa "painel do professor". Reaproveita
// `getDashboardReport` (mesma query pesada usada no PDF) e SÓ agrega/deriva
// os números prontos pra exibição (gráfico de barras, métricas), sem
// duplicar nenhuma consulta ao banco.
// ---------------------------------------------------------------------------------------

export interface ClassAveragePoint {
  className: string;
  average: number | null;
}

export interface DashboardMetrics {
  /** Média geral do tenant (média das médias de turma do período mais recente com nota). */
  overallAverage: number | null;
  /**
   * % de matrículas SEM nenhum ponto de atenção por MOTIVO DE NOTA no
   * período mais recente — proxy de "aprovação" derivado do que o
   * repositório já expõe (não existe um flag formal de aprovado/reprovado
   * por aluno hoje, só os pontos de atenção). Documentado explicitamente
   * como estimativa, não uma taxa de aprovação oficial.
   */
  approvalRatePct: number | null;
  /** Frequência média do tenant, ponderada pelo número de alunos de cada turma. */
  averageAttendancePct: number | null;
  classCount: number;
  studentCount: number;
  assessmentsThisMonth: number;
}

export interface StudentStatusBreakdown {
  /** % sobre matrículas COM pelo menos uma nota lançada (pendente fica de fora do total, mesma lógica de sempre: sem dado não vira estatística). */
  aprovadoPct: number | null;
  recuperacaoPct: number | null;
  reprovadoPct: number | null;
  totalWithGrades: number;
}

export interface DashboardSummary {
  tenantName: string;
  academicYear: number | null;
  classAverages: ClassAveragePoint[];
  attentionPoints: AttentionPoint[];
  metrics: DashboardMetrics;
  studentStatus: StudentStatusBreakdown;
  recentActivity: RecentActivityItem[];
}

/**
 * Função PURA (sem I/O) que deriva o resumo a partir de um `DashboardReport`
 * já buscado — extraída assim pra quem precisar do resumo E do relatório
 * detalhado na MESMA requisição (ex: export Excel, que usa os dois) não
 * pague a consulta pesada duas vezes. `getDashboardSummary` abaixo é só um
 * wrapper fino pra quem só precisa do resumo (o endpoint JSON do painel).
 */
export function deriveDashboardSummary(report: DashboardReport): DashboardSummary {
  // Uma média por turma pro gráfico de barras: média das médias de cada
  // disciplina no período mais recente que JÁ TEM NOTA LANÇADA (varre de
  // trás pra frente e para na primeira não-nula) — diferente do "pontos de
  // atenção" acima (que usa sempre o último período do ano letivo, mesmo
  // sem nota, porque ali "sem nota ainda" não deveria virar alerta). Pro
  // gráfico, mostrar a média mais recente DE VERDADE é mais útil que um
  // grafo vazio só porque o bimestre corrente ainda não tem lançamento.
  const classAverages: ClassAveragePoint[] = report.classes.map((c) => {
    const latestPerSubject = c.subjects
      .map((s) => {
        for (let i = s.termAverages.length - 1; i >= 0; i--) {
          if (s.termAverages[i].average !== null) return s.termAverages[i].average;
        }
        return null;
      })
      .filter((a): a is number => a !== null);
    return { className: c.className, average: averageOf(latestPerSubject) };
  });

  const validClassAverages = classAverages.map((c) => c.average).filter((a): a is number => a !== null);
  const overallAverage = averageOf(validClassAverages);

  const totalEnrollments = report.classes.reduce((sum, c) => sum + c.studentCount, 0);

  // "reason" vem formatado como `média X em Y` (nota) ou `frequência X%`
  // (falta) — ver getDashboardReport acima. Distingue por esse prefixo pra
  // não contar duas vezes o mesmo aluno com problema nos dois motivos, e
  // pra excluir problemas de frequência do cálculo de "aprovação por nota".
  const studentsWithGradeAttention = new Set(
    report.attentionPoints.filter((p) => p.reason.startsWith("média")).map((p) => `${p.className}:${p.studentName}`)
  ).size;
  const approvalRatePct =
    totalEnrollments > 0 ? ((totalEnrollments - studentsWithGradeAttention) / totalEnrollments) * 100 : null;

  const averageAttendancePct =
    totalEnrollments > 0
      ? report.classes.reduce((sum, c) => sum + c.attendancePct * c.studentCount, 0) / totalEnrollments
      : null;

  const { aprovado, recuperacao, reprovado } = report.studentStatusCounts;
  const totalWithGrades = aprovado + recuperacao + reprovado;
  const studentStatus: StudentStatusBreakdown = {
    aprovadoPct: totalWithGrades > 0 ? (aprovado / totalWithGrades) * 100 : null,
    recuperacaoPct: totalWithGrades > 0 ? (recuperacao / totalWithGrades) * 100 : null,
    reprovadoPct: totalWithGrades > 0 ? (reprovado / totalWithGrades) * 100 : null,
    totalWithGrades,
  };

  return {
    tenantName: report.tenantName,
    academicYear: report.academicYear,
    classAverages,
    attentionPoints: report.attentionPoints,
    metrics: {
      overallAverage,
      approvalRatePct,
      averageAttendancePct,
      classCount: report.classes.length,
      studentCount: totalEnrollments,
      assessmentsThisMonth: report.assessmentsThisMonth,
    },
    studentStatus,
    recentActivity: report.recentActivity,
  };
}

export async function getDashboardSummary(tenantId: string): Promise<DashboardSummary> {
  const report = await getDashboardReport(tenantId);
  return deriveDashboardSummary(report);
}
