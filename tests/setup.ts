/**
 * Setup global do Vitest. Nenhum teste abre conexão real com banco — módulos
 * que importam `@/lib/prisma` são mockados no próprio arquivo de teste. As
 * envs dummy abaixo existem só pra que imports transitivos (que leem
 * process.env no load do módulo) não explodam em ambiente de CI sem banco.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:6543/test";
process.env.DIRECT_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret";
