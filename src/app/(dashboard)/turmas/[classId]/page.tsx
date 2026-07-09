import { ClassDetail } from "@/components/turmas/ClassDetail";

export default async function ClassDetailPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8">
      <h1 className="font-heading mb-6 text-lg font-semibold text-[var(--color-foreground)]">Detalhes da turma</h1>
      <ClassDetail classId={classId} />
    </main>
  );
}
