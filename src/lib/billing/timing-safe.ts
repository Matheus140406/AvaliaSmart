import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparação de segredos em tempo constante para strings de tamanhos
 * possivelmente diferentes: passa os dois lados por sha256 primeiro, então
 * o `timingSafeEqual` sempre compara buffers do mesmo tamanho — sem o
 * early-return de comprimento que vazaria informação num `!==` comum.
 * Usada na validação do token do webhook Asaas (o do Mercado Pago já
 * compara HMACs hex de tamanho fixo direto com timingSafeEqual).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
