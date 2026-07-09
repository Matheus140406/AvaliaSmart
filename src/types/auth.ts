/** Espelha o enum `MembershipRole` do Prisma (schema.prisma). Mantido como
 * union de strings, não como import de `@prisma/client`, pra não acoplar
 * tipos de UI/sessão à geração do client Prisma. */
export type MembershipRole = "ADMIN" | "COORDENADOR" | "PROFESSOR" | "ALUNO" | "RESPONSAVEL";
