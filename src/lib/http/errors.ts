/**
 * Erro de negócio com status HTTP e mensagem já prontos pra virar resposta.
 * Services lançam isso pra qualquer falha esperada (permissão, validação de
 * domínio, limite de plano) — o error handler global (ver error-handler.ts)
 * sabe converter em `apiError` sem vazar detalhes internos. Qualquer outro
 * tipo de erro (Prisma, bug, exceção não prevista) vira 500 genérico.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export function unauthorized(message = "Não autenticado."): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = "Sem permissão para esta ação."): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = "Recurso não encontrado."): HttpError {
  return new HttpError(404, message);
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}

export function paymentRequired(message: string): HttpError {
  return new HttpError(402, message);
}
