import type { Metadata } from "next";
import type { ReactNode } from "react";
import SessionProvider from "@/components/auth/SessionProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { MotionConfigProvider } from "@/components/motion/MotionConfigProvider";
import "./globals.css";
import { Manrope, Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";

/** UI (corpo, labels, botões) — pesos usados no design handoff: 400/500/600/700/800. */
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope" });
/** Títulos, números métricos e marca — pesos 500/600/700. */
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "AvaliaSmart",
  description: "Lançamento e gestão de notas escolares",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={cn("font-sans", manrope.variable, spaceGrotesk.variable)}>
      <body className="antialiased">
        <ThemeProvider>
          <MotionConfigProvider>
            <SessionProvider>{children}</SessionProvider>
          </MotionConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
