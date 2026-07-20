"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ObservationSuggestionModal } from "@/components/turmas/ObservationSuggestionModal";

export function ObservationSuggestionButton({
  studentId,
  studentName,
  termId,
}: {
  studentId: string;
  studentName: string;
  termId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <Sparkles size={12} />
        Observação
      </button>
      <ObservationSuggestionModal
        open={open}
        onClose={() => setOpen(false)}
        studentId={studentId}
        studentName={studentName}
        termId={termId}
      />
    </>
  );
}
