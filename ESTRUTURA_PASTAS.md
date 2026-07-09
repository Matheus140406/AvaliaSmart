# AvaliaSmart — Estrutura de Pastas (Next.js App Router)

*Atualizado em 05/07/2026, ao fim da rodada de exportação em PDF + arrumação final do backend.*

Arquitetura em camadas — `route.ts` (HTTP: sessão, Zod, RBAC) → `services/*.service.ts`
(regra de negócio) → `repositories/*.repository.ts` (acesso a dado via Prisma) — aplicada
em todo o backend. Multi-tenancy por `User` global → `Membership` por workspace (`Tenant`).

```
avaliasmart/
├── prisma/
│   ├── schema.prisma                     # 32 models, 14 enums — datasource fica em prisma.config.ts
│   ├── seed.ts                           # Ambiente de demo completo (login: admin@demo.com / senha123)
│   └── migrations/                       # 8 migrations aplicadas (init → payment_receipt)
│
├── src/
│   ├── proxy.ts                          # Substitui middleware.ts (Next.js 16): guarda de sessão/workspace
│   │
│   ├── app/
│   │   ├── layout.tsx
│   │   │
│   │   ├── (auth)/                       # Rotas públicas
│   │   │   ├── login/page.tsx
│   │   │   ├── registrar/page.tsx        # Onboarding: Escola OU Professor Autônomo
│   │   │   ├── esqueci-senha/page.tsx
│   │   │   ├── redefinir-senha/page.tsx
│   │   │   ├── workspaces/page.tsx       # Seletor de workspace (WorkspaceSwitcher)
│   │   │   └── convite/aceitar/page.tsx  # Aceite de convite (Invite)
│   │   │
│   │   ├── (dashboard)/                  # Rotas autenticadas, escopadas por tenant
│   │   │   ├── turmas/[classId]/notas/[subjectId]/page.tsx  # GradeGrid
│   │   │   ├── importar/page.tsx         # ImportWizard (planilha ou foto)
│   │   │   └── planos/page.tsx           # Seleção de plano / upgrade
│   │   │
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── [...nextauth]/route.ts    # Auth.js v5: Credentials + Google
│   │       │   ├── register/route.ts
│   │       │   └── password-reset/{request,confirm}/route.ts
│   │       ├── workspaces/
│   │       │   ├── route.ts                  # POST — cria tenant + Membership ADMIN + trial
│   │       │   └── invites/
│   │       │       ├── route.ts               # POST cria convite / GET lista
│   │       │       ├── accept/route.ts
│   │       │       └── [inviteId]/revoke/route.ts
│   │       ├── grades/route.ts               # GET grid / POST auto-save
│   │       ├── import/commit/route.ts        # POST — commit de planilha (idempotente, em lote)
│   │       ├── ocr/process/route.ts          # POST — foto de lista de notas → Claude (visão)
│   │       ├── analytics/predict/route.ts    # Esqueleto (501) — Etapa de IA de risco, não implementada
│   │       ├── ai/
│   │       │   ├── performance-summary/route.ts     # Resumo de desempenho (turma/aluno), cacheado
│   │       │   ├── observation-suggestions/route.ts # Sugestão de observação pedagógica
│   │       │   ├── observation-suggestions/[suggestionId]/feedback/route.ts
│   │       │   └── chat/route.ts                    # Chat pedagógico com contexto pré-buscado do tenant
│   │       ├── export/pdf/
│   │       │   ├── boletim/route.tsx         # Boletim do aluno (todas disciplinas × bimestres)
│   │       │   ├── ai-summary/route.tsx      # PDF do resumo de desempenho (IA)
│   │       │   └── dashboard/route.tsx       # PDF consolidado: médias, evolução, pontos de atenção
│   │       ├── billing/
│   │       │   ├── checkout/route.ts         # Cria sessão de pagamento (Mercado Pago ou Asaas)
│   │       │   ├── webhook/route.ts           # Webhook Asaas (PAYMENT_CONFIRMED/RECEIVED/OVERDUE)
│   │       │   ├── webhook/mercadopago/route.ts  # Webhook Mercado Pago (/preapproval)
│   │       │   └── receipts/
│   │       │       ├── route.ts               # GET — lista comprovantes de pagamento do tenant
│   │       │       └── [receiptId]/pdf/route.tsx  # GET — baixa o PDF do comprovante (sob demanda)
│   │       └── cron/check-expiring-subscriptions/route.ts  # Cron diário — avisa assinatura vencendo
│   │
│   ├── components/
│   │   ├── grade-grid/
│   │   │   ├── GradeGrid.tsx             # Grid (navegação por teclado, auto-save 500ms)
│   │   │   └── GradeGridConnected.tsx    # Wrapper conectado aos endpoints reais
│   │   ├── import/ImportWizard.tsx       # Upload planilha/foto → mapeamento → commit
│   │   ├── auth/
│   │   │   ├── CreateWorkspaceForm.tsx
│   │   │   ├── WorkspaceSwitcher.tsx     # Dispara update({ activeTenantId }) no JWT
│   │   │   └── SessionProvider.tsx
│   │   ├── billing/UpgradeButton.tsx
│   │   └── pdf/                          # Documentos @react-pdf/renderer (não HTML/CSS)
│   │       ├── shared-styles.ts          # StyleSheet + rodapé comuns aos 4 documentos
│   │       ├── BoletimDocument.tsx
│   │       ├── AiSummaryDocument.tsx
│   │       ├── DashboardReportDocument.tsx
│   │       └── PaymentReceiptDocument.tsx
│   │
│   ├── services/                         # Camada de regra de negócio (chamada pelos route.ts)
│   │   ├── grade.service.ts               # Grid de notas + auto-save
│   │   ├── import.service.ts              # Resolução de linhas, dedupe, commit idempotente
│   │   ├── ocr.service.ts                 # Validação + chamada de visão + registro de uso
│   │   ├── invite.service.ts              # Convite: criar/listar/revogar/aceitar + limite de seats
│   │   ├── billing/receipt.service.tsx    # Renderiza PDF do comprovante sob demanda + lista por tenant
│   │   └── ai/
│   │       ├── ai.service.ts               # generate() isolado (Vercel AI SDK + Anthropic)
│   │       ├── client.ts                   # Config do provider/modelo
│   │       ├── guard.ts                    # Plan-gating + rate limit (30 chamadas/hora/tenant)
│   │       ├── performance-summary.service.ts
│   │       ├── observation-suggestion.service.ts
│   │       └── chat.service.ts
│   │
│   ├── repositories/                     # Camada de acesso a dado (só Prisma, sem regra de negócio)
│   │   ├── class-subject.repository.ts    # Lookup compartilhado (grades/import/ocr)
│   │   ├── grade.repository.ts
│   │   ├── import.repository.ts
│   │   ├── ocr.repository.ts
│   │   ├── invite.repository.ts
│   │   ├── plan.repository.ts             # Leitura de Plan com cache in-memory de 60s
│   │   ├── performance.repository.ts      # Dados agregados p/ resumo de IA (turma/aluno)
│   │   ├── tenant-snapshot.repository.ts  # Contexto pré-buscado do tenant p/ chat de IA
│   │   └── dashboard-report.repository.ts # Agregação completa p/ PDF do dashboard
│   │
│   ├── lib/
│   │   ├── prisma.ts                     # PrismaClient + Client Extension (tenant-scoping automático)
│   │   ├── auth.ts                       # Auth.js v5: JWT, Credentials + Google, activeTenantId/role
│   │   ├── with-tenant.ts                # Wrapper de rota: sessão + AsyncLocalStorage + error handler global
│   │   ├── tenant-context.ts             # AsyncLocalStorage do tenant ativo
│   │   ├── roles.ts                      # WRITE_ROLES (ADMIN/COORDENADOR/PROFESSOR)
│   │   ├── http/
│   │   │   ├── api-response.ts           # apiSuccess/apiError — envelope { success, data|error }
│   │   │   ├── errors.ts                 # HttpError + badRequest/notFound/forbidden/paymentRequired/...
│   │   │   └── error-handler.ts          # withErrorHandling() p/ rotas públicas (sem sessão)
│   │   ├── billing/
│   │   │   ├── guard.ts                  # resolveSubscription + requireFeature/Capacity/OcrCapacity
│   │   │   ├── mercadopago.ts             # createSubscription/fetchPayment/verifySignature (HMAC)
│   │   │   ├── asaas.ts                   # ensureCustomer/createSubscription
│   │   │   ├── webhook-idempotency.ts     # withWebhookIdempotency() — claim + mutação atômicos
│   │   │   ├── external-reference.ts      # Codifica/decodifica {tenantId, tier} nos gateways
│   │   │   └── cycle.ts                   # MONTHLY/QUARTERLY/SEMIANNUALLY/YEARLY
│   │   ├── email/resend.ts               # sendEmail() com anexos (PDF) — nunca derruba o fluxo chamador
│   │   ├── grades/
│   │   │   ├── calculations.ts           # Média ponderada, status (client + server)
│   │   │   └── serialize.ts              # Prisma → DTO da GradeGrid (rota + páginas server-side)
│   │   ├── import/
│   │   │   ├── parse-spreadsheet.ts       # Parse de .xlsx/.csv/.ods no client
│   │   │   └── validate.ts
│   │   └── ocr/extract-grade-sheet.ts     # generateObject (Claude, visão) + Zod schema da tabela
│   │
│   └── types/
│       ├── grade-grid.ts
│       ├── import.ts
│       ├── auth.ts
│       └── next-auth.d.ts                 # Augmentação de sessão/JWT (activeTenantId/membershipId/role)
│
├── .env.example
├── prisma.config.ts                       # datasource + adapter (Prisma 7 — não fica no schema.prisma)
├── next.config.ts
└── package.json
```

## Decisões-chave

- **`proxy.ts`** (não `middleware.ts` — renomeado no Next.js 16): redireciona sem sessão
  → `/login`, sem workspace ativo → seletor de workspace; exceção explícita para as
  rotas de criação de workspace (`WORKSPACE_SETUP_PATHS`) para não travar o próprio
  onboarding.
- **`services/` + `repositories/`** aplicado a TODAS as rotas autenticadas (grades,
  import, ocr, invites, IA, billing/receipts) — nenhuma lógica de negócio mora em
  `route.ts`; a rota só faz sessão (`withTenant`), Zod e RBAC grosso (`WRITE_ROLES`),
  e delega pro service. `class-subject.repository.ts` centraliza um lookup idêntico
  repetido em 3 domínios (grades/import/ocr) — `ClassSubject` não tem `tenantId`
  direto, então essa checagem de tenant é sempre manual.
- **Envelope de resposta único** (`{ success, data }` / `{ success, error }`) via
  `lib/http/api-response.ts`, reforçado pelo error handler global dentro de
  `withTenant()` — nenhum erro interno vaza detalhe pro cliente.
- **PDFs sob demanda**: os 4 documentos em `components/pdf/` usam
  `@react-pdf/renderer` (não Puppeteer/HTML — Chromium estoura o limite de função da
  Vercel) e são renderizados a cada request via `renderToBuffer()`, nunca
  pré-gerados/armazenados. `PaymentReceipt` guarda só os dados estruturados; o PDF do
  comprovante nasce tanto no download quanto no e-mail automático do webhook.
- **Dois gateways de pagamento** (Mercado Pago `/preapproval` e Asaas), webhooks
  idempotentes via `withWebhookIdempotency()` — o carimbo de "processado" e a
  mutação de negócio (ativar assinatura, criar `PaymentReceipt`) rodam na MESMA
  transação Prisma.
- **IA isolada em `services/ai/`**: um único ponto de chamada ao provider
  (`ai.service.ts`), reusado por resumo de desempenho, sugestão de observação e chat
  — troca de modelo/provider não toca nas rotas.
