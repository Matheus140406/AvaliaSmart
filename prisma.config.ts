import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moveu a URL de conexão e o comando de seed pra cá — schema.prisma
 * não aceita mais `url = env(...)` no datasource, e package.json não é mais
 * lido pra config de seed. Fica no root do projeto (ao lado do
 * package.json), não dentro de prisma/.
 *
 * Migrations usam DIRECT_URL (conexão direta, porta 5432), não DATABASE_URL
 * (pooler de transação, porta 6543) — o modo "transaction" do PgBouncer não
 * suporta os advisory locks que `prisma migrate` precisa. Isso é específico
 * de bancos atrás de pooler (Supabase, Neon, etc.); o app em runtime
 * continua usando o DATABASE_URL pooled normalmente (ver lib/prisma.ts).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
