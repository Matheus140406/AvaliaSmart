import { prisma } from "@/lib/prisma";

/**
 * ClassSubject não tem `tenantId` direto (é escopado via relação `class`) —
 * a Client Extension não injeta o filtro automaticamente aqui, então todo
 * chamador precisa comparar `classSubject.class.tenantId` na mão. Consulta
 * repetida idêntica em grades, import/commit e ocr/process — centralizada
 * aqui pra não divergir entre os três.
 */
export function findClassSubjectWithClass(classSubjectId: string) {
  return prisma.classSubject.findUnique({
    where: { id: classSubjectId },
    include: { class: true, subject: true },
  });
}
