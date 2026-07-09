# Handoff: AvaliaSmart — App do Professor (Login · Dashboard · Nova Avaliação · Detalhes) + Assistente One

## Overview
AvaliaSmart é um SaaS multi-tenant de gestão de notas escolares para professores brasileiros
(lançamento de notas, frequência, boletim em PDF, análise de desempenho) com uma assistente de
IA embutida — a **One** — que interpreta dados e ajuda pedagogicamente.

Este pacote entrega o design de duas partes:
1. **App do professor** (`AvaliaSmart App.dc.html`) — layout principal responsivo + 4 telas:
   Login, Dashboard, Nova Avaliação (stepper), Detalhes da Turma.
2. **Assistente One** (`One - Avaliacao Iterativa.dc.html`) — chat iterativo (uma pergunta por
   vez, 5 etapas, relatório final) + tela de carregamento dedicada.

## About the Design Files
Os arquivos deste bundle são **referências de design feitas em HTML** — protótipos que mostram a
aparência e o comportamento pretendidos, **não código de produção para copiar diretamente**.
A tarefa é **recriar estes designs no codebase alvo** usando os padrões e bibliotecas já
estabelecidos. Se o projeto ainda não existe, a stack alvo recomendada (pedida pelo cliente) é:

- **Next.js (App Router)** + **TypeScript** (tipagem estrita)
- **Tailwind CSS**
- **shadcn/ui** (Radix UI por baixo) para componentes base acessíveis
- **Zustand** (estado global leve) ou React Context onde fizer sentido
- **Lucide React** para ícones (no protótipo os ícones são SVGs inline equivalentes)
- **Recharts** para os gráficos (no protótipo são mocks em CSS)

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos e interações são finais. Recrie a UI
fielmente usando os componentes do codebase. Os wireframes low-fi (`Wireframes AvaliaSmart.dc.html`)
são apenas contexto de exploração inicial — não são a referência final.

## Design Tokens

### Cores
- Primária (índigo/azul): `#3b5bd9`  · hover `#2a45b8` · soft `#eef1fb` · borda soft `#dbe4fb`
- Acento gradiente login: `#3b5bd9 → #4f46e5 → #6366f1`
- Neutros (slate): texto `#0f172a`, texto forte `#1e293b`, secundário `#475569`,
  muted `#64748b`, faint `#94a3b8`, placeholder `#cbd5e1`
- Superfícies: fundo app `#f6f8fb`, card `#ffffff`, fundo sutil `#fafbfd`
- Linhas: `#e6ebf2` (bordas card), `#eef2f7` / `#f1f5f9` (divisórias)
- Sucesso: `#10b981` / soft `#ecfdf5`
- Atenção: `#f59e0b` / `#d97706` / soft `#fef3c7`
- Erro: `#ef4444` / soft `#fef2f2`
- Info/ciano: `#0891b2` / soft `#ecfeff`

### Tipografia
- UI: **Manrope** (400/500/600/700/800)
- Títulos/números/marca: **Space Grotesk** (500/600/700)
- Escala usada: título de tela 18–19px/600; H1 login 26px/700; números métricos 28px/700 (Space Grotesk);
  corpo 14–14.5px; labels 13px/600; meta/caption 12–13px; badge 11–12px.

### Raio, sombra, espaçamento
- Raio: inputs/botões 11–12px, cards 16px, painéis 18px, pills 20px, avatares circulares 50%.
- Sombra card padrão: nenhuma (borda `1px #e6ebf2`); botão primário `0 8px 18px -9px rgba(59,91,217,.7)`;
  drawer mobile `0 20px 50px rgba(15,23,42,.2)`.
- Padding: cards 18–22px; conteúdo da página 26px 24px; gap de grid 16px.
- Container central de conteúdo: `max-width:1120px` (dashboard/detalhes), `720px` (stepper), `380px` (login).

## Screens / Views

### Layout principal (shell)
- **Sidebar** 256px fixa à esquerda (desktop). Contém: marca (avatar One + "AvaliaSmart"),
  botão primário **"+ Nova avaliação"**, grupo MENU (Dashboard, Turmas, Avaliações, Alunos,
  Relatórios), rodapé (Falar com a One · Configurações · Sair).
  - Item ativo: `bg #eef1fb`, texto `#3b5bd9`. Inativo: texto `#64748b`, hover `bg #f1f5f9`.
- **Topbar** 66px: (hambúrguer no mobile) + título da tela + busca (só no Dashboard) + sino com
  badge vermelho + avatar "MR" (Marina Reis, Professora).
- **Responsivo (mobile-first):** abaixo de **900px** a sidebar vira **drawer** deslizante
  (`translateX(-110%)` → `0`) com scrim `rgba(15,23,42,.45)`; aparece o botão hambúrguer;
  grids de métricas viram 2 colunas, gráficos/detalhes/stepper viram 1 coluna.

### Tela 1 — Login
- Duas colunas (desktop): painel de marca com gradiente índigo (headline, subtítulo, stats
  "4.2k+ professores", "120k+ boletins") + card de formulário à direita. Mobile: só o card.
- Campos: E-mail (validação `/.+@.+\..+/`), Senha (obrigatória). Erro → borda `#ef4444`,
  fundo `#fef2f2`, mensagem 12.5px vermelha. Link "Esqueci minha senha".
- Botão "Entrar" primário + divisor "ou" + "Entrar com Google". Demo: qualquer credencial entra.

### Tela 2 — Dashboard
- 4 **cards de métrica** (Turmas ativas 8 +2, Alunos 243 +18, Média geral 7,4 +0,3,
  Avaliações no mês 19 −4). Cada card: ícone quadrado colorido + badge de delta (verde sobe /
  vermelho desce) + número grande (Space Grotesk) + label.
- **Gráfico de barras** "Média por turma" (6ºA…9ºB): barras `#3b5bd9`, ou `#f59e0b` quando média < 7.
  → substituir por Recharts `<BarChart>`.
- **Donut** "Situação dos alunos" (62% acima / 22% atenção / 16% abaixo) com legenda.
  → Recharts `<PieChart>` com innerRadius.
- **Tabela "Atividades recentes"**: colunas Aluno/Turma · Ação · Data · Status. **Busca** filtra por
  aluno+ação; **paginação** de 5 em 5 (Anterior/Próximo com estados desabilitados). Status: pill
  Concluído (verde) / Pendente (âmbar) / Atrasado (vermelho). Avatar com iniciais em paleta rotativa.

### Tela 3 — Nova Avaliação (Stepper)
- Header com **stepper de 4 etapas** (Informações · Critérios · Configuração · Revisão); etapa
  concluída = check em círculo `#3b5bd9`, ativa = círculo com anel `0 0 0 4px #dbe4fb`, futura = cinza.
  Linha conectora fica azul conforme avança.
- **Etapa 0 — Informações:** Título (obrigatório), Turma (select, obrigatório), Disciplina (select),
  Tipo (chips: Prova/Trabalho/Diagnóstica/Projeto — seleção única).
- **Etapa 1 — Critérios:** lista editável de competências (nome + peso %), adicionar/remover;
  rodapé mostra a soma dos pesos (verde se = 100%, âmbar caso contrário).
- **Etapa 2 — Configuração:** Data (date), Bimestre (select), Nota máxima (numérico), Recuperação (select).
- **Etapa 3 — Revisão:** key/value dos dados. Botão final "Criar avaliação" → **tela de sucesso**
  (check verde, título da avaliação, "Ver turma" / "Criar outra").
- Validação: etapa 0 exige título e turma (borda/fundo de erro + mensagem). Botão "Voltar" na etapa 0
  retorna ao Dashboard.

### Tela 4 — Detalhes da Turma
- Duas colunas (desktop). **Esquerda:** card de cabeçalho (badge "7A", "7º A · Matemática",
  professora) + 3 mini-stats (28 alunos, 7,4 média, 92% frequência) + card "Alunos em atenção"
  (avatar vermelho, nome, motivo, média). **Direita:** card **"Linha do tempo"** — trilha vertical
  com marcadores coloridos por tipo (notas, boletim, resumo da One, recuperação, criação da turma),
  cada evento com título, descrição e data. Link "Resumo com a One →".

### Assistente One (arquivo separado)
- **Rail** com marca, trilha das 5 etapas (Escopo → Público → Critérios → Coleta → Relatório) e
  botão "Nova avaliação".
- **Chat**: cabeçalho com avatar One + "Etapa X de 5"; balões (IA à esquerda com avatar, usuário à
  direita em `#3b5bd9`); indicador de digitação (3 pontos animados); **chips de resposta rápida**.
- **Tela de carregamento** dedicada (ícone grande do One em anel giratório + "Preparando sua avaliação…").
- **Relatório final** (etapa 5): card com header gradiente, critérios/pesos, destaques, próximos passos,
  botões Exportar PDF/Excel/Salvar no boletim.
- **Lógica de IA:** chamada a um LLM com system prompt que força saída JSON
  `{ etapa, mensagem, sugestoes[], relatorio|null }`, uma pergunta por vez, escopo travado em
  assuntos escolares, anonimização de nomes de alunos antes de qualquer chamada externa.
  No protótipo usa um helper `window.claude.complete`; no codebase real, trocar pela sua rota de IA
  (Vercel AI SDK / Gemini / Anthropic) preservando o contrato JSON.

## Interactions & Behavior
- Navegação client-side entre telas (login → dashboard; sidebar troca de view; "+ Nova avaliação"
  abre o stepper resetado; linhas/links levam a Detalhes).
- Animações: entrada de conteúdo `fadeUp .4s`; barras `growBar .6s`; anel de loading `spin`;
  transição do drawer `.25s ease`.
- Estados: erro de formulário, loading (chat), sucesso (stepper), vazio evitado por mock data.
- Responsivo por breakpoint 900px (ver shell).

## State Management
Sugerido (Zustand): `authStore` (usuário, login/logout), `uiStore` (view atual, sidebar mobile),
`createStore` (step, form, criterios, validação, created), `dashboardStore` (busca, página).
Assistente One: `chatStore` (mensagens, etapa, thinking, suggestions, report) + serviço de IA.

## Assets
- `uploads/icon-one.png` — ícone/avatar do personagem One (rosto com óculos e bigode, traço azul).
  Usado como avatar em toda a UI e ampliado na tela de carregamento. Fornecido pelo cliente.
- Fontes: Google Fonts **Manrope** e **Space Grotesk**.
- Ícones: no protótipo são SVGs inline; no codebase usar **Lucide React** (equivalentes:
  LayoutDashboard, Layers, ClipboardCheck, Users, BarChart3, Plus, Search, Bell, Settings, LogOut, Menu, Check).

## Files
- `AvaliaSmart App.dc.html` — app do professor (login, dashboard, stepper, detalhes) + shell responsivo.
- `One - Avaliacao Iterativa.dc.html` — assistente One (chat iterativo, loading, relatório).
- `Wireframes AvaliaSmart.dc.html` — wireframes low-fi (contexto de exploração; não é a referência final).
- `uploads/icon-one.png` — asset do personagem One.
