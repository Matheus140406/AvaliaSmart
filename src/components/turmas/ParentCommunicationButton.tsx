"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { ParentCommunicationModal } from "@/components/turmas/ParentCommunicationModal";
import type { CommunicationScope } from "@/services/ai/parent-communication.service";

export function ParentCommunicationButton({
  scopeType,
  scopeId,
  scopeLabel,
  className,
}: {
  scopeType: CommunicationScope;
  scopeId: string;
  scopeLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1 text-xs font-medium text-brand hover:underline ${className ?? ""}`}
      >
        <MessageSquareText size={12} />
        Comunicado
      </button>
      <ParentCommunicationModal
        open={open}
        onClose={() => setOpen(false)}
        scopeType={scopeType}
        scopeId={scopeId}
        scopeLabel={scopeLabel}
      />
    </>
  );
}
