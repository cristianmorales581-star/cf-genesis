import { PageHeader, EmptyState } from "@/components/ui-bits";
export default function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState title="En construcción" hint="Esta sección estará disponible en la próxima iteración del MVP." />
    </>
  );
}
