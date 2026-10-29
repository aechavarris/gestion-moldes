import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteClient } from "@/lib/actions";
import { Header, Main } from "@/components/Header";
import { ClientForm } from "@/components/ClientForm";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await db.client.findUnique({ where: { id }, include: { _count: { select: { sheets: true } } } });
  if (!client) notFound();

  return (
    <>
      <Header title="Editar cliente" back={{ href: `/clients/${id}`, label: client.name }} />
      <Main>
        <ClientForm id={id} initial={client} />
        <form action={deleteClient.bind(null, id)} className="flex justify-center">
          <ConfirmButton message={`¿Eliminar ${client.name} y sus ${client._count.sheets} fichas? No se puede deshacer.`}>
            Eliminar cliente
          </ConfirmButton>
        </form>
      </Main>
    </>
  );
}
