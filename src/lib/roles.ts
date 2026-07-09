import type { MembershipRole } from "@prisma/client";

/** Papéis que podem lançar/importar notas e gerar boletins — reusado em grades, import e export. */
export const WRITE_ROLES: ReadonlySet<MembershipRole> = new Set(["ADMIN", "COORDENADOR", "PROFESSOR"]);
