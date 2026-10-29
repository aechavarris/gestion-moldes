import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Header, Main } from "@/components/Header";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  const clients = await db.client.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    include: { _count: { select: { sheets: true } } },
  });

  return (
    <>
      <Header title="Clientes" />
      <Main>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} className="input" placeholder="Filtrar clientes…" type="search" />
        </form>
        <Link href="/clients/new" className="btn-primary">
          + Nuevo cliente
        </Link>
        {clients.length === 0 ? (
          <p className="py-8 text-center text-muted">{q ? "Ningún cliente coincide." : "Aún no hay clientes."}</p>
        ) : (
          <ul className="card divide-y divide-border">
            {clients.map((client) => (
              <li key={client.id}>
                <Link href={`/clients/${client.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <span className="truncate font-medium">{client.name}</span>
                  <span className="shrink-0 text-sm text-muted">
                    {client._count.sheets} {client._count.sheets === 1 ? "ficha" : "fichas"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/users" className="mt-4 text-center text-sm text-muted">
          Usuarios y contraseña
        </Link>
      </Main>
    </>
  );
}
