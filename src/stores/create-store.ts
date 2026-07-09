import { create } from "zustand";

/**
 * Estado do stepper "Nova Avaliação" — vive num store à parte (não
 * `useState` local) porque o wizard guiado da One (`one-wizard-store.ts`,
 * feature separada) pode querer preencher os mesmos campos por conversa em
 * vez de formulário; um store compartilhável evita duplicar o shape depois.
 */

export interface AssessmentCriterion {
  id: string;
  name: string;
  weight: number;
}

export interface CreateAssessmentState {
  step: number;
  title: string;
  classId: string | null;
  subjectId: string | null;
  typeId: string | null;
  criteria: AssessmentCriterion[];
  scheduledDate: string;
  termId: string | null;
  maxScore: number;
  hasRecovery: boolean;
  created: { classId: string; title: string } | null;

  setStep: (step: number) => void;
  setField: <K extends "title" | "classId" | "subjectId" | "typeId" | "scheduledDate" | "termId" | "maxScore" | "hasRecovery">(
    key: K,
    value: CreateAssessmentState[K]
  ) => void;
  addCriterion: () => void;
  updateCriterion: (id: string, patch: Partial<Omit<AssessmentCriterion, "id">>) => void;
  removeCriterion: (id: string) => void;
  setCreated: (result: { classId: string; title: string } | null) => void;
  reset: () => void;
}

function newCriterion(): AssessmentCriterion {
  return { id: crypto.randomUUID(), name: "", weight: 100 };
}

const INITIAL = {
  step: 0,
  title: "",
  classId: null,
  subjectId: null,
  typeId: null as string | null,
  criteria: [newCriterion()],
  scheduledDate: "",
  termId: null,
  maxScore: 10,
  hasRecovery: false,
  created: null,
};

export const useCreateStore = create<CreateAssessmentState>((set) => ({
  ...INITIAL,

  setStep: (step) => set({ step }),
  setField: (key, value) => set({ [key]: value }),
  addCriterion: () => set((s) => ({ criteria: [...s.criteria, newCriterion()] })),
  updateCriterion: (id, patch) =>
    set((s) => ({ criteria: s.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  removeCriterion: (id) => set((s) => ({ criteria: s.criteria.length > 1 ? s.criteria.filter((c) => c.id !== id) : s.criteria })),
  setCreated: (created) => set({ created }),
  reset: () => set({ ...INITIAL, criteria: [newCriterion()] }),
}));
