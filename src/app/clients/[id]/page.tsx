import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Header, Main } from "@/components/Header";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: { sheets: { orderBy: { updatedAt: "desc" }, select: { id: true, title: true, material: true, updatedAt: true, _count: { select: { photos: true } } } } },
  });
  if (!client) notFound();

  const details = [client.contact, client.phone, client.email].filter(Boolean);

  return (
    <>
      <Header title={client.name} back={{ href: "/", label: "Clientes" }} />
      <Main>
        {details.length || client.notes ? (
          <section className="card flex flex-col gap-1 p-4 text-sm">
            {client.contact ? <p>{client.contact}</p> : null}
            {client.phone ? (
              <a className="text-accent" href={`tel:${client.phone}`}>
                {client.phone}
              </a>
            ) : null}
            {client.email ? (
              <a className="text-accent" href={`mailto:${client.email}`}>
                {client.email}
              </a>
            ) : null}
            {client.notes ? <p className="whitespace-pre-wrap text-muted">{client.notes}</p> : null}
          </section>
        ) : null}

        <div className="flex gap-2">
          <Link href={`/clients/${client.id}/sheets/new`} className="btn-primary flex-1">
            + Nueva ficha
          </Link>
          <Link href={`/clients/${client.id}/edit`} className="btn-ghost">
            Editar cliente
          </Link>
        </div>

        <h2 className="font-semibold">
          Fichas ({client.sheets.length})
        </h2>
        {client.sheets.length === 0 ? (
          <p className="py-6 text-center text-muted">Este cliente aún no tiene fichas.</p>
        ) : (
          <ul className="card divide-y divide-border">
            {client.sheets.map((sheet) => (
              <li key={sheet.id}>
                <Link href={`/sheets/${sheet.id}`} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="font-medium">{sheet.title}</span>
                  <span className="text-sm text-muted">
                    {[sheet.material, formatDate(sheet.updatedAt), sheet._count.photos ? `📷 ${sheet._count.photos}` : null].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Main>
    </>
  );
}
