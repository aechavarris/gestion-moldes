import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteSheet } from "@/lib/actions";
import { Header, Main } from "@/components/Header";
import { SheetForm } from "@/components/SheetForm";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function EditSheetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const sheet = await db.techSheet.findUnique({
    where: { id },
    include: { barrelZones: { orderBy: { position: "asc" } }, _count: { select: { photos: true } } },
  });
  if (!sheet) notFound();

  return (
    <>
      <Header title="Editar ficha" back={{ href: `/sheets/${id}`, label: sheet.title }} />
      <Main>
        <SheetForm clientId={sheet.clientId} sheetId={id} initial={sheet} />
        <form action={deleteSheet.bind(null, id)} className="flex justify-center">
          <ConfirmButton
            message={`¿Eliminar la ficha "${sheet.title}"${sheet._count.photos ? ` y sus ${sheet._count.photos} fotos` : ""}? No se puede deshacer.`}
          >
            Eliminar ficha
          </ConfirmButton>
        </form>
      </Main>
    </>
  );
}
