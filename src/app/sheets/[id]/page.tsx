import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { duplicateSheet } from "@/lib/actions";
import { formatDate, formatNumber } from "@/lib/format";
import { BARREL_ZONE_UNIT, MAX_PHOTOS_PER_SHEET, SHEET_GROUPS, SHEET_NUMBER_FIELDS } from "@/lib/sheetFields";
import { Header, Main } from "@/components/Header";
import { PhotoGallery } from "@/components/PhotoGallery";
import { PhotoUploader } from "@/components/PhotoUploader";

export const dynamic = "force-dynamic";

function Value({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="font-mono text-lg font-semibold whitespace-nowrap">
      {formatNumber(value)} <span className="text-sm text-muted">{unit}</span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span>{label}</span>
      {children}
    </li>
  );
}

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const sheet = await db.techSheet.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      barrelZones: { orderBy: { position: "asc" } },
      photos: { orderBy: { createdAt: "asc" }, select: { id: true, width: true, height: true } },
      updatedBy: { select: { displayName: true } },
    },
  });
  if (!sheet) notFound();

  return (
    <>
      <Header title={sheet.title} back={{ href: `/clients/${sheet.client.id}`, label: sheet.client.name }} />
      <Main>
        <section className="card flex flex-col gap-1 p-4">
          <p className="text-sm text-muted">{sheet.client.name}</p>
          <p className="text-xl font-semibold">{sheet.title}</p>
          {sheet.material ? (
            <p>
              <span className="text-muted">Material:</span> <span className="font-medium">{sheet.material}</span>
            </p>
          ) : null}
          <p className="text-sm text-muted">
            Actualizada {formatDate(sheet.updatedAt)}
            {sheet.updatedBy ? ` por ${sheet.updatedBy.displayName}` : ""}
          </p>
        </section>

        {SHEET_GROUPS.map((group) => {
          const zones = group.key === "temperatures" ? sheet.barrelZones : [];
          const fields = SHEET_NUMBER_FIELDS.filter((field) => field.group === group.key && sheet[field.key] != null);
          if (!zones.length && !fields.length) return null;
          return (
            <section key={group.key} className="card p-4">
              <h2 className="mb-1 font-semibold">{group.label}</h2>
              {zones.length ? (
                <>
                  <p className="text-sm text-muted">Usillo</p>
                  <ul className="mb-2 divide-y divide-border">
                    {zones.map((zone) => (
                      <Row key={zone.id} label={zone.label}>
                        <Value value={zone.temperature} unit={BARREL_ZONE_UNIT} />
                      </Row>
                    ))}
                  </ul>
                </>
              ) : null}
              <ul className="divide-y divide-border">
                {fields.map((field) => (
                  <Row key={field.key} label={field.label}>
                    <Value value={sheet[field.key]!} unit={field.unit} />
                  </Row>
                ))}
              </ul>
            </section>
          );
        })}

        {sheet.notes ? (
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Notas</h2>
            <p className="whitespace-pre-wrap">{sheet.notes}</p>
          </section>
        ) : null}

        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-semibold">Fotos ({sheet.photos.length})</h2>
          <PhotoGallery photos={sheet.photos} />
          <PhotoUploader sheetId={sheet.id} disabled={sheet.photos.length >= MAX_PHOTOS_PER_SHEET} />
        </section>

        <div className="flex gap-2">
          <Link href={`/sheets/${sheet.id}/edit`} className="btn-primary flex-1">
            Editar
          </Link>
          <form action={duplicateSheet.bind(null, sheet.id)}>
            <button className="btn-ghost">Duplicar</button>
          </form>
        </div>
      </Main>
    </>
  );
}
