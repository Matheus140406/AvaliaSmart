import { z } from "zod";
import type { NextResponse } from "next/server";
import { requireAiFeature } from "./guard";
import { generateExam } from "./exam-generator.service";
import { generateFlashcards } from "./flashcard-generator.service";
import { generateLessonPlan } from "./lesson-plan.service";
import { adaptTextLevel } from "./text-level-adapter.service";
import { gradeEssay } from "./essay-grading.service";
import { generateAccessibilityContent } from "./accessibility.service";

/**
 * Pílulas de comando do chat (Etapa 8) — contrato pro frontend oferecer
 * botões de atalho ("Criar quiz", "Plano de aula", "Simplificar
 * linguagem"...) que chamam a funcionalidade certa DIRETO, sem depender da
 * IA do chat interpretar a intenção por linguagem natural.
 *
 * Cada comando é só um roteador fino pro service já existente da
 * respectiva Etapa (1-6) — zero lógica de IA nova aqui, zero duplicação.
 * Cada um faz seu PRÓPRIO `requireAiFeature` (planos diferentes liberam
 * comandos diferentes — ex: um tenant no Mensal Base tem `gerar_prova` mas
 * não `plano_aula`).
 *
 * IMPORTANTE (limite de propósito, não omissão): comandos aqui só aceitam
 * TEXTO em `context` — nenhum deles recebe upload de imagem. Se o
 * professor quiser gerar a partir de foto/scan (documento ou redação), o
 * frontend deve chamar o endpoint DEDICADO da feature
 * (`/api/ai/exam-generator`, `/api/ai/essay-grading`, etc.) diretamente,
 * que já aceita multipart com `image`. Descrição de Imagens
 * (`/api/ai/image-description`) não tem pílula de comando por esse motivo
 * — só existe como endpoint dedicado.
 */

export const CHAT_COMMANDS = [
  "gerar_prova",
  "gerar_flashcards",
  "plano_aula",
  "adaptar_texto",
  "corrigir_redacao",
  "acessibilidade",
] as const;

export type ChatCommand = (typeof CHAT_COMMANDS)[number];

const commandContextSchemas = {
  gerar_prova: z.object({
    text: z.string().trim().min(50),
    subjectHint: z.string().trim().max(200).optional(),
  }),
  gerar_flashcards: z.object({
    text: z.string().trim().min(50),
    subjectHint: z.string().trim().max(200).optional(),
  }),
  plano_aula: z.object({
    text: z.string().trim().min(50),
    subjectHint: z.string().trim().max(200).optional(),
  }),
  adaptar_texto: z.object({
    text: z.string().trim().min(20),
    targetLevel: z.enum(["FUNDAMENTAL", "MEDIO", "EJA"]),
  }),
  corrigir_redacao: z
    .object({
      text: z.string().trim().min(50),
      criteriaPreset: z.literal("ENEM").optional(),
      customCriteria: z.string().trim().min(10).optional(),
      studentLabel: z.string().trim().max(120).optional(),
    })
    .refine((v) => Boolean(v.criteriaPreset) !== Boolean(v.customCriteria), {
      message: "Informe criteriaPreset=\"ENEM\" OU customCriteria (exatamente um dos dois).",
    }),
  acessibilidade: z.object({
    text: z.string().trim().min(30),
  }),
} satisfies Record<ChatCommand, z.ZodType>;

export function parseCommandContext(command: ChatCommand, context: unknown) {
  return commandContextSchemas[command].safeParse(context ?? {});
}

export interface DispatchUser {
  tenantId: string;
  membershipId: string;
}

/**
 * Executa o comando já validado. Retorna `NextResponse` quando o guard de
 * plano bloqueia (mesma convenção de `requireAiFeature` usada em todas as
 * rotas) — quem chama precisa checar `instanceof NextResponse` antes de
 * envelopar em `apiSuccess`.
 */
export async function dispatchChatCommand(
  command: ChatCommand,
  context: z.infer<(typeof commandContextSchemas)[ChatCommand]>,
  user: DispatchUser
): Promise<NextResponse | Record<string, unknown>> {
  switch (command) {
    case "gerar_prova": {
      const ctx = context as z.infer<typeof commandContextSchemas.gerar_prova>;
      const block = await requireAiFeature(user.tenantId, "examGenerator");
      if (block) return block;
      return generateExam({ tenantId: user.tenantId, membershipId: user.membershipId, sourceText: ctx.text, subjectHint: ctx.subjectHint });
    }
    case "gerar_flashcards": {
      const ctx = context as z.infer<typeof commandContextSchemas.gerar_flashcards>;
      const block = await requireAiFeature(user.tenantId, "flashcards");
      if (block) return block;
      return generateFlashcards({ tenantId: user.tenantId, membershipId: user.membershipId, sourceText: ctx.text, subjectHint: ctx.subjectHint });
    }
    case "plano_aula": {
      const ctx = context as z.infer<typeof commandContextSchemas.plano_aula>;
      const block = await requireAiFeature(user.tenantId, "lessonPlan");
      if (block) return block;
      return generateLessonPlan({ tenantId: user.tenantId, membershipId: user.membershipId, sourceText: ctx.text, subjectHint: ctx.subjectHint });
    }
    case "adaptar_texto": {
      const ctx = context as z.infer<typeof commandContextSchemas.adaptar_texto>;
      const block = await requireAiFeature(user.tenantId, "textLevelAdapter");
      if (block) return block;
      return adaptTextLevel({ tenantId: user.tenantId, membershipId: user.membershipId, sourceText: ctx.text, targetLevel: ctx.targetLevel });
    }
    case "corrigir_redacao": {
      const ctx = context as z.infer<typeof commandContextSchemas.corrigir_redacao>;
      const block = await requireAiFeature(user.tenantId, "essayGrading");
      if (block) return block;
      return gradeEssay({
        tenantId: user.tenantId,
        membershipId: user.membershipId,
        essayText: ctx.text,
        criteriaPreset: ctx.criteriaPreset,
        customCriteria: ctx.customCriteria,
        studentLabel: ctx.studentLabel,
      });
    }
    case "acessibilidade": {
      const ctx = context as z.infer<typeof commandContextSchemas.acessibilidade>;
      const block = await requireAiFeature(user.tenantId, "accessibility");
      if (block) return block;
      return generateAccessibilityContent({ tenantId: user.tenantId, membershipId: user.membershipId, sourceText: ctx.text });
    }
  }
}
