"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent } from "@/components/layout/Sidebar";

/**
 * `<Sidebar>` some abaixo de 900px sem NENHUMA alternativa em telas
 * pequenas — este botão (só visível `min-[900px]:hidden`, ao lado do logo
 * no `AppHeader`) abre o mesmo conteúdo (`<SidebarContent>`, fonte única
 * compartilhada) num drawer usando o `Sheet` do shadcn/ui, como pedido no
 * handoff de design (antes usava o `<Modal variant="drawer">` hand-rolled).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="px-2 min-[900px]:hidden" aria-label="Abrir menu">
        <Menu size={20} />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
