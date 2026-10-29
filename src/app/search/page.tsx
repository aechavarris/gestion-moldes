import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Header, Main } from "@/components/Header";

export const dynamic = "force-dynamic";

/** Searches every sheet of every client: handy at the machine when you only remember the part or the material. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  const contains = { contains: q, mode: "insensitive" as const };
  const sheets = q
    ? await db.techSheet.findMany({
        where: {
          OR: [{ title: contains }, { material: contains }, { notes: contains }, { client: { name: contains } }],
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { client: { select: { name: true } } },
      })
    : [];

  return (
    <>
      <Header title="Buscar fichas" back={{ href: "/", label: "Clientes" }} />
      <Main>
        <form>
          <input name="q" defaultValue={q} className="input" placeholder="Pieza, material, cliente…" type="search" autoFocus />
        </form>
        {q && sheets.length === 0 ? <p className="py-6 text-center text-muted">Sin resultados.</p> : null}
        {sheets.length ? (
          <ul className="card divide-y divide-border">
            {sheets.map((sheet) => (
              <li key={sheet.id}>
                <Link href={`/sheets/${sheet.id}`} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="font-medium">{sheet.title}</span>
                  <span className="text-sm text-muted">
                    {[sheet.client.name, sheet.material].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Main>
    </>
  );
}
