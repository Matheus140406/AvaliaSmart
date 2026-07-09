# AvaliaSmart — API Reference

Todas as rotas vivem em `src/app/api/**/route.ts` (Next.js App Router — não há servidor Fastify separado).

## Convenções gerais

**Envelope de resposta.** Toda rota JSON (exceto `GET /api/export/pdf/boletim`, que devolve um PDF binário, e `/api/auth/[...nextauth]`, que é o handler interno do Auth.js) devolve um dos dois formatos abaixo — nunca um objeto solto:

```jsonc
// sucesso
{ "success": true, "data": { /* ... */ } }

// falha
{ "success": false, "error": "mensagem pronta pra mostrar ao usuário", "details": { /* opcional, ex: erros de Zod */ } }
```

**Autenticação.** A maioria das rotas usa `withTenant` (`src/lib/with-tenant.ts`): exige sessão (cookie do Auth.js) **e** workspace ativo (`activeTenantId` escolhido no seletor pós-login). Rotas marcadas "sessão apenas" abaixo não exigem workspace ativo — são exatamente as que resolvem "ainda não ter um".

**Erros.** Lance `HttpError` (`src/lib/http/errors.ts` — `badRequest`, `notFound`, `forbidden`, `conflict`, `paymentRequired`, `unauthorized`) dentro do handler; `withTenant`/`withErrorHandling` convertem automaticamente pro envelope de erro com o status certo. Qualquer exceção não tratada (bug, erro do Prisma) vira `500` genérico — o erro real só é logado no servidor, nunca devolvido ao cliente.

**Validação.** Toda rota que recebe body/query de usuário valida com Zod antes de tocar no banco.

**Multi-tenant.** Toda query em modelo com `tenantId` direto (`Student`, `Class`, `Membership`, etc.) é auto-escopada por uma Prisma Client Extension (`lib/prisma.ts`) — mas só em `findMany/findFirst/updateMany/deleteMany/count`. Modelos sem `tenantId` direto (`ClassSubject`, `Term`, `GradeConfig`, `Enrollment`) são escopados via relação, checado explicitamente em cada rota.

---

## Autenticação

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | — | Handlers internos do Auth.js v5 (login, callback OAuth, sessão). |
| `/api/auth/register` | POST | pública | Cadastro por e-mail/senha. `{name, email, password}` → `{id, email}`. |
| `/api/auth/password-reset/request` | POST | pública | `{email}` → sempre a mesma mensagem genérica (sem enumeration). Envia e-mail com link se a conta existir. |
| `/api/auth/password-reset/confirm` | POST | pública | `{token, password}` → troca a senha. Token de uso único, expira em 1h. |

## Workspaces e convites

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/workspaces` | POST | sessão apenas | Cria o primeiro Tenant + Membership ADMIN + assinatura TESTE_GRATIS (5 dias). `{name, type}` → `{tenantId, tenantName, membershipId, trialEndsAt}`. |
| `/api/workspaces/invites` | POST | `withTenant`, ADMIN | Convida alguém por e-mail (COORDENADOR ou PROFESSOR — nunca ADMIN). Bloqueia com 402 se o tenant já está no teto de usuários do plano (`Plan.maxUsers`, contando ativos + convites pendentes). `{email, role}` → convite criado, e-mail enviado via Resend. |
| `/api/workspaces/invites` | GET | `withTenant`, ADMIN | Lista todos os convites do tenant (qualquer status). |
| `/api/workspaces/invites/[inviteId]/revoke` | POST | `withTenant`, ADMIN | Cancela um convite PENDENTE. |
| `/api/workspaces/invites/accept` | POST | sessão apenas | `{token}` → cria a Membership pro usuário logado (precisa ser o mesmo e-mail do convite). Idempotente: aceitar 2x não dá erro. |

## Notas e importação

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/grades` | GET | `withTenant` | Hidrata a GradeGrid: `?classSubjectId=&termId=` → alunos, avaliações, notas lançadas. |
| `/api/grades` | POST | `withTenant`, ADMIN/COORDENADOR/PROFESSOR | Auto-save de uma nota (upsert por `[enrollmentId, gradeConfigId]`). |
| `/api/import/commit` | POST | `withTenant`, ADMIN/COORDENADOR/PROFESSOR | Confirma import de planilha (alunos+notas). Idempotente por `idempotencyKey`. Checa teto de alunos do plano (`Plan.maxStudents`). |
| `/api/ocr/process` | POST | `withTenant`, ADMIN/COORDENADOR/PROFESSOR | `multipart/form-data` (imagem + `classSubjectId` + `termId`) → tabela extraída via Claude. Checa teto mensal de OCR do plano (`Plan.maxOcrPerMonth`). |
| `/api/export/pdf/boletim` | GET | `withTenant`, ADMIN/COORDENADOR/PROFESSOR | `?enrollmentId=` → PDF do boletim (binário, `Content-Type: application/pdf` — não usa o envelope JSON). |
| `/api/analytics/predict` | POST | `withTenant` | **Stub (501)** — reservado pra Etapa 6 (IA). |

## Billing

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/billing/checkout` | POST | `withTenant`, ADMIN | Cria assinatura recorrente no gateway ativo (Mercado Pago `/preapproval` > Asaas > modo dev, nessa ordem). `{tier, payerName, payerEmail, cpfCnpj?}` → `{checkoutUrl}`. |
| `/api/billing/webhook` | POST | token (`ASAAS_WEBHOOK_TOKEN`) | Webhook do Asaas. Idempotente via `WebhookEvent` — claim + mutação na mesma transação. |
| `/api/billing/webhook/mercadopago` | POST | HMAC (`MERCADOPAGO_WEBHOOK_SECRET`) | Webhook do Mercado Pago. Mesma garantia de idempotência. |
| `/api/cron/check-expiring-subscriptions` | GET | `CRON_SECRET` (Bearer) | 1x/dia (Vercel Cron): expira assinaturas vencidas, avisa 3 dias antes e no dia do vencimento. |

---

## Planos (tabela vigente — `Plan`, banco de dados)

| tier | duração | usuários | turmas | alunos | OCR/mês | preço total | mensal equiv. |
|---|---|---|---|---|---|---|---|
| `TESTE_GRATIS` | 5 dias | 1 | ilimitado | ilimitado | 20 | R$0 | R$0 |
| `MENSAL_BASE` | 30 dias | 3 | 5 | 200 | 50 | R$99 | R$99 |
| `MENSAL_AVANCADO` | 30 dias | 10 | 20 | 800 | 150 | R$249 | R$249 |
| `TRIMESTRAL` | 90 dias | 15 | 30 | 1200 | 300 | R$672 | R$224 |
| `SEMESTRAL` | 180 dias | 30 | ilimitado | ilimitado | ilimitado | R$1.194 | R$199 |

Todos os planos pagos têm as mesmas features (OCR, assistente de IA, predição de risco, exports avançados, suporte prioritário) — a diferença entre eles é só duração/preço/tetos numéricos. Editar preços/tetos é uma alteração de dado (`UPDATE "Plan" ...`), não deploy.

## Camadas (Etapa 1)

```
route.ts (HTTP: parse, valida com Zod, checa role/HttpError)
  -> services/*.service.ts   (regra de negócio: invite.service.ts é a referência)
    -> repositories/*.repository.ts  (acesso a dados via Prisma: plan.repository.ts, invite.repository.ts)
```

As rotas de billing/planos/convites (novas) seguem essa separação estrita. As rotas herdadas (`grades`, `import/commit`, `ocr/process`) foram padronizadas no formato de resposta e error handling, mas a lógica de negócio ainda mora no `route.ts` — extrair pra `services/` é o próximo passo natural, não feito ainda nesta rodada (ver relatório da Etapa 1+2 para escopo).
