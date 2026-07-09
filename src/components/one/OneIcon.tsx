"use client";

import Image from "next/image";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { EASE_STANDARD, TRANSITION_REDUCED } from "@/lib/motion";

/**
 * `<OneIcon />` — mascote animado da One, indicador de status/carregamento
 * em qualquer lugar que dependa da IA (chat, resumo, gerador de provas,
 * correção de redação, etc.). Componente "burro": só troca de aparência
 * conforme a prop `status` — quem decide QUANDO mudar de estado é sempre
 * quem chama (ver `components/chat/ChatCard.tsx`).
 *
 * Usa a arte real da mascote (`public/icon-one.png`, PNG com canal alfa —
 * já existia no projeto, mas nunca tinha sido referenciada em lugar
 * nenhum) em vez da aproximação em `<motion.path>` traçada à mão que
 * existia aqui antes (aquela existia só porque nenhum asset de verdade
 * tinha sido recebido até então).
 *
 * "thinking" ganhou um anel duplo girando ao redor da mascote (arco
 * externo no sentido horário + arco interno mais curto no sentido
 * anti-horário), reimplementado com `variants`/`animate` do Motion — o
 * design de referência veio como CSS puro (`@keyframes spin/breathe`),
 * mas Framer Motion é o único mecanismo de animação do produto (ver
 * `lib/motion.ts`); nenhum `@keyframes` foi copiado.
 *
 * PROPS
 * - `status: "idle" | "thinking" | "done"` (obrigatório)
 *   - "idle"     — mascote parada, sem anel.
 *   - "thinking" — anel duplo girando + mascote "respirando" (scale/opacity
 *                  em loop, 1.6s).
 *   - "done"     — pulse de escala na mascote (1 → 1.08 → 1, ~350ms, uma
 *                  vez só), sem anel.
 * - `size?: number` — tamanho em px (largura=altura). Default: 40.
 * - `label?: string` — aria-label. Default varia por estado.
 * - `className?: string` — classes extras (posicionamento, margem, etc.)
 *
 * ACESSIBILIDADE: `useReducedMotion()` desliga o giro do anel e a
 * respiração/pulse de escala — com a preferência ativada, "thinking" vira
 * só o anel aparecendo estático (sem girar), uma troca discreta em vez de
 * movimento contínuo, mesma filosofia da versão anterior deste componente.
 */

export type OneIconStatus = "idle" | "thinking" | "done";

export interface OneIconProps {
  status: OneIconStatus;
  size?: number;
  label?: string;
  className?: string;
}

const DEFAULT_LABEL: Record<OneIconStatus, string> = {
  idle: "One",
  thinking: "One está pensando…",
  done: "One terminou",
};

export function OneIcon({ status, size = 40, label, className }: OneIconProps) {
  const prefersReducedMotion = useReducedMotion();

  const mascotVariants: Variants = prefersReducedMotion
    ? {
        idle: { scale: 1, opacity: 1, transition: TRANSITION_REDUCED },
        thinking: { scale: 1, opacity: 1, transition: TRANSITION_REDUCED },
        done: { scale: 1, opacity: 1, transition: TRANSITION_REDUCED },
      }
    : {
        idle: { scale: 1, opacity: 1 },
        thinking: {
          scale: [1, 0.92, 1],
          opacity: [1, 0.82, 1],
          transition: { duration: 1.6, repeat: Infinity, ease: EASE_STANDARD },
        },
        done: { scale: [1, 1.08, 1], opacity: 1, transition: { duration: 0.35, ease: EASE_STANDARD } },
      };

  // `rotate: [0, 360]` (keyframes), não `rotate: 360` (alvo único) — padrão
  // recomendado do próprio Motion pra giro contínuo. Um alvo único com
  // `repeat: Infinity` fica vulnerável a um caso real: se "thinking" for
  // interrompido (troca pra "done"/"idle") e reativado de novo enquanto o
  // ângulo atual já está perto de 360, o Motion pode não ter uma distância
  // angular real pra percorrer e o anel fica visualmente parado (girando
  // "no lugar") até a rotação acumulada se desalinhar o bastante — olhando
  // estático mesmo com o loop tecnicamente rodando. Keyframes evita isso
  // porque cada ciclo é sempre relativo (soma 360/-360 ao valor atual, não
  // aponta pra um valor absoluto fixo).
  const outerRingVariants: Variants = prefersReducedMotion
    ? { idle: { opacity: 0 }, thinking: { opacity: 1, transition: TRANSITION_REDUCED }, done: { opacity: 0 } }
    : {
        idle: { opacity: 0, rotate: 0 },
        thinking: {
          opacity: 1,
          rotate: [0, 360],
          transition: { opacity: { duration: 0.2 }, rotate: { duration: 1.4, repeat: Infinity, ease: "linear" } },
        },
        done: { opacity: 0, rotate: 0, transition: { duration: 0.2 } },
      };

  const innerRingVariants: Variants = prefersReducedMotion
    ? { idle: { opacity: 0 }, thinking: { opacity: 0.55, transition: TRANSITION_REDUCED }, done: { opacity: 0 } }
    : {
        idle: { opacity: 0, rotate: 0 },
        thinking: {
          opacity: 0.55,
          rotate: [0, -360],
          transition: { opacity: { duration: 0.2 }, rotate: { duration: 2.1, repeat: Infinity, ease: "linear" } },
        },
        done: { opacity: 0, rotate: 0, transition: { duration: 0.2 } },
      };

  return (
    <span
      role="img"
      aria-label={label ?? DEFAULT_LABEL[status]}
      className={["relative inline-block", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    >
      {/* Anel externo — arco maior, sentido horário */}
      <motion.svg
        viewBox="0 0 100 100"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        initial={false}
        animate={status}
        variants={outerRingVariants}
      >
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(var(--color-brand-rgb), 0.18)" strokeWidth="5" />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="95 188"
        />
      </motion.svg>

      {/* Anel interno — arco curto, sentido anti-horário */}
      <motion.svg
        viewBox="0 0 100 100"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        initial={false}
        animate={status}
        variants={innerRingVariants}
      >
        <circle
          cx="50"
          cy="50"
          r="37"
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="23 209"
        />
      </motion.svg>

      {/* Mascote — imagem real, centralizada com margem pros anéis. Dimensão
          explícita em px (não `fill`) — mesmo padrão de `next/image` já
          usado em AppHeader/telas de login, mais previsível que depender
          de `inset` percentual pra derivar o tamanho.
          `unoptimized`: reproduzi ao vivo um 400 do pipeline de otimização
          de imagem do Next logo após limpar `.next`/reiniciar o servidor
          ("The requested resource isn't a valid image" — corrida de
          cold-start no endpoint `/_next/image`, intermitente, não
          reproduz sempre). Como `<img>` nunca tenta de novo sozinho depois
          de falhar, isso deixa o ícone quebrado até um reload manual —
          exatamente o sintoma reportado. Pra um ícone decorativo pequeno
          (~33KB) sem ganho real de redimensionar/converter formato via
          otimizador, bypassar o pipeline inteiro é mais robusto do que
          torcer pra corrida não acontecer de novo. */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        initial={false}
        animate={status}
        variants={mascotVariants}
      >
        <Image
          src="/icon-one.png"
          alt=""
          width={Math.round(size * 0.7)}
          height={Math.round(size * 0.7)}
          style={{ objectFit: "contain" }}
          unoptimized
        />
      </motion.div>
    </span>
  );
}
