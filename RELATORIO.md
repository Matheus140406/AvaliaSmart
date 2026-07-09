# AvaliaSmart — Relatório de Estado do Backend

*Atualizado em 05/07/2026, ao fim da rodada de exportação em PDF + arrumação profissional final.*

---

## 1. O que está construído

### Núcleo de dados
Schema Prisma com **32 models / 14 enums**, aplicado via 8 migrations reais (`prisma migrate deploy`,
não `db push`): multi-tenancy (login único `User` → `Membership` por `Tenant`), estrutura acadêmica
completa (ano letivo, bimestres, turmas, disciplinas, matrículas), notas com pesos configuráveis,
frequência, convites (`Invite`), plano/assinatura (`Plan`/`Subscription`, 5 tiers), idempotência de
webhook (`WebhookEvent`), auditoria (`AuditLog`), import (`ImportHistory`), IA (`AiUsageLog`/
`AiSummaryCache`/`AiObservationSuggestion`/`AiChatMessage`) e comprovante de pagamento
(`PaymentReceipt`, desta rodada).

### Arquitetura em camadas (100% das rotas autenticadas)
`route.ts` (sessão via `withTenant`, Zod, RBAC grosso) → `services/*.service.ts` (regra de negócio,
lança `HttpError`) → `repositories/*.repository.ts` (só Prisma). Nesta rodada, os últimos três
endpoints que ainda misturavam tudo em `route.ts` (**grades**, **import/commit**, **ocr/process**)
foram extraídos — ver §3. Não sobrou nenhuma rota com lógica de negócio embutida.

### APIs (todas protegidas por sessão + tenant + role, envelope `{ success, data|error }`)

| Área | Rotas | O que faz |
|---|---|---|
| Auth | `/api/auth/[...nextauth]`, `register`, `password-reset/*` | Auth.js v5 (Credentials + Google), cadastro, reset de senha |
| Workspace | `/api/workspaces`, `/invites*` | Criação de tenant+trial, convite (limite por plano), aceite, revogação |
| Notas | `GET/POST /api/grades` | Hidrata a Grid e recebe auto-save (upsert `[enrollmentId, gradeConfigId]`) |
| Import | `POST /api/import/commit` | Planilha → banco: idempotente (chave única + rollback), bulk (~6 queries em vez de ~600), audit em `ImportHistory` |
| OCR | `POST /api/ocr/process` | Foto de lista de notas → Claude (visão, `generateObject`+Zod) → mesmo formato do parser de planilha |
| IA | `/api/ai/performance-summary`, `/observation-suggestions*`, `/chat` | Resumo cacheado (turma/aluno), sugestão de observação com feedback, chat com contexto pré-buscado; todas com plan-gating + rate limit (30/h/tenant) |
| Risco (IA) | `POST /api/analytics/predict` | **Esqueleto (501)** — runtime/validação prontos, lógica pendente (não fazia parte desta rodada) |
| Export PDF | `/api/export/pdf/boletim`, `/ai-summary`, `/dashboard` | Boletim, resumo de IA em PDF, dashboard consolidado (médias, evolução, pontos de atenção) — **desta rodada, ver §2** |
| Billing | `/api/billing/checkout`, `/webhook`, `/webhook/mercadopago`, `/receipts*` | Checkout (Mercado Pago ou Asaas), webhooks idempotentes, comprovante em PDF sob demanda + e-mail automático — **desta rodada** |
| Cron | `/api/cron/check-expiring-subscriptions` | Aviso diário de assinatura vencendo (Resend) |

### Infraestrutura transversal
- **`withTenant()`**: resolve sessão, entra num `AsyncLocalStorage` com `tenantId`/`membershipId`, e é
  o error handler global das rotas autenticadas (`HttpError` → `apiError`; qualquer outra exceção →
  500 genérico, nunca vaza detalhe interno).
- **Prisma Client Extension**: injeta `where: { tenantId }` automaticamente em
  `findMany/findFirst/updateMany/deleteMany/count` nos modelos com `tenantId` direto. Modelos
  escopados por relação (`ClassSubject`, `Term`, `GradeConfig`, `Enrollment`, `Class`) exigem checagem
  manual em cada service — é isso que `class-subject.repository.ts` centraliza.
- **`proxy.ts`** (Next.js 16 renomeou `middleware.ts`): sem sessão → `/login`; sem workspace ativo →
  seletor de workspace.
- **Webhooks idempotentes**: `withWebhookIdempotency()` roda o carimbo "processado" e a mutação de
  negócio na MESMA transação — reentrega genuína reprocessa, duplicata não.

### Frontend funcional (o que existe de UI)
- `GradeGrid` conectada (auto-save 500ms, médias/cores em tempo real).
- `ImportWizard` (upload planilha **ou foto** → mapeamento → commit).
- Login, cadastro, reset de senha, seletor/criação de workspace, aceite de convite, página de plano.
- **Sem UI própria ainda**: os 3 novos endpoints de PDF, o resumo/chat de IA e a listagem de
  comprovantes só existem como API — não há botão/tela que os chame. Isso é trabalho de frontend,
  não pendência de backend.

---

## 2. O que foi entregue nesta rodada (Frente A — PDF + Frente B — arrumação final)

### Frente A — Exportação em PDF
- **A1**: `GET /api/export/pdf/ai-summary?classId=|studentId=&termId=` — reaproveita o resumo já
  gerado pela IA (`getPerformanceSummary`, cacheado 24h) e formata em PDF com
  `@react-pdf/renderer` (mesma lib do boletim — nenhuma dependência nova).
- **A2**: `GET /api/export/pdf/dashboard` — novo `dashboard-report.repository.ts` agrega, por turma
  ativa do tenant, médias por disciplina/período (todos os bimestres, não só atual+anterior) e uma
  lista de pontos de atenção (aluno abaixo da média no período mais recente, ou frequência <75%).
- **A3**: novo model `PaymentReceipt`; os dois webhooks (Mercado Pago e Asaas) agora criam o
  comprovante **dentro da mesma transação idempotente** que ativa o plano, e enviam o PDF por e-mail
  (Resend, anexo nativo) na confirmação. `GET /api/billing/receipts` lista, `GET
  /api/billing/receipts/[id]/pdf` baixa sob demanda (tenant-scoped).
- **Comum às 3**: PDF nunca é pré-gerado/armazenado — cada requisição chama `renderToBuffer()` na
  hora e devolve o arquivo direto na resposta (`Content-Type: application/pdf`).
- **Decisão visual (não travou o trabalho, pode ser refinada depois)**: cabeçalho com nome
  "AVALIASMART" em texto (não existe asset de logo no projeto — não há pasta `public/`), estilo
  simples e profissional, mesma paleta neutra do boletim já existente.

### Frente B — Arrumação profissional final
- **B1**: `grades`, `import/commit` e `ocr/process` extraídos para
  `services/{grade,import,ocr}.service.ts` + `repositories/{grade,import,ocr,class-subject}.repository.ts`.
  O lookup de `ClassSubject+Class` (repetido idêntico nos 3) foi centralizado em
  `class-subject.repository.ts` em vez de triplicado. Reteste ao vivo (servidor local + banco
  seedado) confirmou: GET/POST `/api/grades` ok, `/api/import/commit` ok **incluindo idempotência**
  (retry com a mesma chave não duplicou aluno/nota), `/api/ocr/process` ok até o limite externo
  (ver §4 — mesma limitação de crédito da conta Anthropic já reportada, não uma regressão).
- **B2**: este arquivo e `ESTRUTURA_PASTAS.md` reescritos do zero a partir da árvore real do projeto
  (os dois estavam descrevendo um plano inicial nunca seguido à risca — nomes de arquivo errados,
  sem `services/`/`repositories/`, sem billing/IA/PDF).
- **B3**: varredura de consistência — ver §5.

---

## 3. O que falta (em ordem de importância)

1. **Frontend das features desta e da rodada anterior** — botões/telas para os 3 PDFs, resumo/chat de
   IA, listagem de comprovantes de pagamento. Hoje só existem como API.
2. **Predição de risco (IA)** — endpoint ainda é um esqueleto 501; feature `riskPrediction` já existe
   no `Plan` mas não tem implementação.
3. **Páginas de dashboard/listagem** — lista de turmas, lista de alunos, configuração de avaliações.
   As URLs de hoje (`turmas/[classId]/notas/[subjectId]`) precisam ser conhecidas de cor.
4. **Motor de notificações** — schema pronto (`NotificationTemplate`/`Log`), zero código de envio.
5. **Exports restantes** — Ata de Resultados Finais, Mapa de Notas, Excel/CSV (infra de PDF e
   `calculations.ts` já prontos, custo marginal baixo).
6. **Endurecimento adicional** — MFA, headers de segurança adicionais, monitoramento/observabilidade
   (rate limiting já existe para IA; para as demais rotas ainda não).

---

## 4. Avisos honestos

- **Conta Anthropic sem crédito**: `ANTHROPIC_API_KEY` configurada e válida (autenticação passa), mas
  a conta está sem saldo — toda chamada real à IA (resumo, chat, sugestão, OCR) retorna o fallback
  gracioso de erro (502, mensagem curta, nada vaza). Testado nesta rodada com um `AiSummaryCache`
  seedado manualmente pra validar a renderização do PDF A1 sem depender de crédito — **isso não é
  bug de código, é preciso adicionar crédito na conta Anthropic pra testar o caminho feliz de
  verdade.**
- **Chave da Anthropic foi colada em texto puro no chat** (agora configurada em `.env`) — igual às
  outras credenciais coladas ao longo deste projeto (senha do Supabase, tokens do Mercado Pago,
  client secret do Google). Funciona, mas fica registrada no histórico da conversa; recomendo rotação
  se a conta for permanecer em uso.
- **Sem asset de logo**: os PDFs usam "AVALIASMART" em texto no cabeçalho — trivial trocar por
  `<Image src=... />` quando houver um arquivo de logo.
- **`Content-Disposition: inline`** nos 3 novos PDFs (abre no navegador em vez de forçar download) —
  mesma escolha já usada no boletim; trocar pra `attachment` é uma linha, se preferirem forçar
  download.

---

## 5. Consistência (Frente B3)

- **Envelope `{ success, data|error }`**: confirmado em 100% das rotas sob `withTenant`/
  `withErrorHandling` — nenhuma rota devolve JSON cru fora do padrão. As 3 rotas de PDF são exceção
  *esperada e documentada*: devolvem `application/pdf` binário quando ok (é o próprio arquivo), e
  caem no envelope padrão de erro quando falham (404/403/500), porque o erro ainda passa pelo mesmo
  `withTenant`.
- **Todas as rotas que exigem sessão usam `withTenant`**; conferido arquivo por arquivo (25
  `route.ts`/`route.tsx` em `app/api`). As únicas 4 sem `withTenant` são exceções esperadas, com
  autenticação própria: `auth/[...nextauth]` (handler do Auth.js), os 2 webhooks de billing
  (HMAC/token do gateway) e o cron (`Authorization: Bearer CRON_SECRET` injetado pela Vercel).
- **Zod em toda entrada que tem o que validar**: confirmado nas 3 rotas novas de PDF (query params) e
  em todas as rotas de mutação de negócio. As únicas sem Zod são: rotas com só path param e nenhum
  outro input (`receipts/[id]/pdf`, `invites/[id]/revoke` — já era o padrão existente antes desta
  rodada), e os 2 webhooks de billing, que narrowa campo a campo (`typeof x === "string"`, etc.) em
  vez de um schema Zod formal — decisão deliberada, não lacuna: o payload varia de formato por tipo
  de evento do gateway (pagamento, assinatura, estorno...), então um schema único e rígido rejeitaria
  eventos legítimos que hoje são ignorados de propósito (`default: break`). Autenticidade desses dois
  já vem de HMAC (Mercado Pago) / token (Asaas), não de Zod.
- **RBAC + isolamento multi-tenant nas 3 rotas de PDF** — testado ao vivo, não só lido no código:
  - `ai-summary`: `classId`/`studentId` de outro tenant → 404 (`assertClassInTenant`/
    `assertStudentInTenant`), nunca vaza existência do recurso.
  - `dashboard`: agregação já nasce filtrada por `tenantId` (com asserção redundante em runtime no
    repositório, mesma cautela de LGPD já usada no chat de IA).
  - `receipts/[id]/pdf`: comprovante de outro tenant → 404 (`renderReceiptPdf` recebe `tenantId` da
    sessão e compara antes de renderizar); criei um tenant "rival" de teste com um comprovante
    próprio e confirmei que a sessão do tenant original não consegue baixá-lo.
  - Todas as 3 exigem `WRITE_ROLES`/`ADMIN` conforme o caso — testado com o usuário ADMIN seedado.
- **`npm audit`**: 6 avisos (5 moderate, 1 high), agrupados em 3 causas — nenhuma delas introduzida
  por dependência adicionada nesta rodada (não toquei em `next`, `prisma`, `xlsx` ou tooling de CSS):
  - `xlsx` (high, sem fix — já conhecida da auditoria original) — mitigação em vigor: parsing só roda
    no server, sempre atrás de `withTenant` + Zod, nunca com planilha de origem não autenticada.
  - `postcss` (moderate) — vem embutido dentro do próprio `next@16.2.10` (dependência interna do
    pipeline de build, não algo que o app importa); corrigir exigiria trocar de major do Next.
  - `@hono/node-server` (moderate) — transitivo de `prisma` (CLI, `devDependency`, roda só em
    tooling local/CI, nunca no runtime da aplicação); corrigir exigiria downgrade de major do Prisma.
  Nenhuma delas expõe caminho de ataque adicional na aplicação em produção; as duas novas são
  dev-tooling/build-time, não dependência de runtime do app.

---

## 6. Status final

**Pronto pra começar o frontend.** As 3 rotas de PDF, o refactor de `grades`/`import`/`ocr` e a
documentação estão completos e testados ao vivo (banco real, sessão real, casos de sucesso e de
isolamento). O único item que impede um teste 100% ponta-a-ponta da IA é crédito na conta Anthropic
— não bloqueia o frontend, que pode ser construído contra os endpoints normalmente (o fallback de
erro já é gracioso e vai desaparecer sozinho assim que a conta tiver saldo).
