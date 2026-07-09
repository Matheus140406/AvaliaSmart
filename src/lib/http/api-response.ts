import { NextResponse } from "next/server";

/**
 * Envelope padrão de resposta da API — toda rota (nova ou retrofitada)
 * devolve este shape, nunca um objeto solto. `error` é sempre string (a
 * mensagem pronta pra mostrar ao usuário); detalhes de validação (Zod)
 * vão em `details`, separados da mensagem principal.
 */
export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: string; details?: unknown };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(message: string, status = 400, details?: unknown): NextResponse<ApiFailure> {
  return NextResponse.json(
    details !== undefined ? { success: false, error: message, details } : { success: false, error: message },
    { status }
  );
}
