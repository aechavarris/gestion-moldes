import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Header, Main } from "@/components/Header";
import { SheetForm } from "@/components/SheetForm";

export default async function NewSheetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await db.client.findUnique({ where: { id }, select: { name: true } });
  if (!client) notFound();

  return (
    <>
      <Header title="Nueva ficha" back={{ href: `/clients/${id}`, label: client.name }} />
      <Main>
        <SheetForm clientId={id} sheetId={null} />
      </Main>
    </>
  );
}
