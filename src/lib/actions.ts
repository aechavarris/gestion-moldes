"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  clearLoginFailures,
  endSession,
  hashPassword,
  isLockedOut,
  recordLoginFailure,
  requireUser,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { MAX_PHOTOS_PER_SHEET } from "@/lib/sheetFields";
import { firstError, readClientForm, readSheetForm, userSchema, type SheetInput } from "@/lib/validation";

export type FormState = { error?: string; ok?: string };

/** Only local paths, so the login cannot be abused as an open redirect. */
const safeNext = (next: FormDataEntryValue | null) => {
  const value = String(next ?? "/");
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
};

export async function login(_state: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  if (isLockedOut(username)) return { error: "Demasiados intentos. Espera 15 minutos." };
  const user = await db.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(String(form.get("password") ?? ""), user.passwordHash))) {
    recordLoginFailure(username);
    return { error: "Usuario o contraseña incorrectos" };
  }
  clearLoginFailures(username);
  await startSession(user.id);
  redirect(safeNext(form.get("next")));
}

/** Creates the first account. Only allowed while there are no users at all (fresh install). */
export async function setupFirstUser(_state: FormState, form: FormData): Promise<FormState> {
  if ((await db.user.count()) > 0) return { error: "Ya hay usuarios: inicia sesión." };
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { password, ...data } = parsed.data;
  const user = await db.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
  await startSession(user.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function createUser(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { password, ...data } = parsed.data;
  if (await db.user.findUnique({ where: { username: data.username } })) return { error: "Ese usuario ya existe" };
  await db.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
  revalidatePath("/users");
  return { ok: `Usuario ${data.username} creado` };
}

export async function deleteUser(id: string) {
  const me = await requireUser();
  // Deleting yourself could leave nobody able to sign in.
  if (id === me.id) return;
  await db.user.delete({ where: { id } });
  revalidatePath("/users");
}

export async function changePassword(_state: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(String(form.get("current") ?? ""), user.passwordHash))) {
    return { error: "La contraseña actual no es correcta" };
  }
  const parsed = userSchema.shape.password.safeParse(String(form.get("password") ?? ""));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(parsed.data) } });
  return { ok: "Contraseña cambiada" };
}

export async function saveClient(id: string | null, _state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = readClientForm(form);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const data = { ...parsed.data, nameKey: parsed.data.name.toLowerCase() };
  const clash = await db.client.findUnique({ where: { nameKey: data.nameKey }, select: { id: true } });
  if (clash && clash.id !== id) return { error: "Ya existe un cliente con ese nombre" };
  const client = id ? await db.client.update({ where: { id }, data }) : await db.client.create({ data });
  revalidatePath("/");
  redirect(`/clients/${client.id}`);
}

export async function deleteClient(id: string) {
  await requireUser();
  await db.client.delete({ where: { id } });
  revalidatePath("/");
  redirect("/");
}

function zoneRows(zones: SheetInput["barrelZones"]) {
  return zones.map((zone, position) => ({ ...zone, position }));
}

export async function saveSheet(
  clientId: string,
  sheetId: string | null,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readSheetForm(form);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { barrelZones, ...fields } = parsed.data;
  const sheet = sheetId
    ? await db.techSheet.update({
        where: { id: sheetId },
        // Zones are a small ordered list: replacing them is simpler than diffing rows.
        data: { ...fields, updatedById: user.id, barrelZones: { deleteMany: {}, create: zoneRows(barrelZones) } },
      })
    : await db.techSheet.create({
        data: { ...fields, clientId, createdById: user.id, updatedById: user.id, barrelZones: { create: zoneRows(barrelZones) } },
      });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/sheets/${sheet.id}`);
}

/** Copies the settings (not the photos) to start a variant of a part. */
export async function duplicateSheet(id: string) {
  const user = await requireUser();
  const { id: _id, createdAt, updatedAt, createdById, updatedById, barrelZones, title, ...rest } =
    await db.techSheet.findUniqueOrThrow({ where: { id }, include: { barrelZones: true } });
  const copy = await db.techSheet.create({
    data: {
      ...rest,
      title: `${title} (copia)`,
      createdById: user.id,
      updatedById: user.id,
      barrelZones: { create: barrelZones.map(({ label, temperature, position }) => ({ label, temperature, position })) },
    },
  });
  revalidatePath(`/clients/${rest.clientId}`);
  redirect(`/sheets/${copy.id}/edit`);
}

export async function deleteSheet(id: string) {
  await requireUser();
  const sheet = await db.techSheet.delete({ where: { id } });
  revalidatePath(`/clients/${sheet.clientId}`);
  redirect(`/clients/${sheet.clientId}`);
}

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_THUMB_BYTES = 300 * 1024;

/** The phone always sends JPEG (it re-encodes on a canvas), so anything else is rejected. */
const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

export async function uploadPhoto(sheetId: string, form: FormData): Promise<FormState> {
  await requireUser();
  const photo = form.get("photo");
  const thumbnail = form.get("thumbnail");
  if (!(photo instanceof File) || !(thumbnail instanceof File)) return { error: "No se ha recibido la foto" };
  if (photo.size > MAX_PHOTO_BYTES || thumbnail.size > MAX_THUMB_BYTES) return { error: "La foto es demasiado grande" };
  const data = new Uint8Array(await photo.arrayBuffer());
  const thumb = new Uint8Array(await thumbnail.arrayBuffer());
  if (!isJpeg(data) || !isJpeg(thumb)) return { error: "Formato de imagen no válido" };
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return { error: "Foto no válida" };
  if ((await db.photo.count({ where: { sheetId } })) >= MAX_PHOTOS_PER_SHEET) {
    return { error: `Máximo ${MAX_PHOTOS_PER_SHEET} fotos por ficha` };
  }
  await db.photo.create({ data: { sheetId, data, thumbnail: thumb, width, height } });
  revalidatePath(`/sheets/${sheetId}`);
  return {};
}

export async function deletePhoto(id: string) {
  await requireUser();
  const photo = await db.photo.delete({ where: { id }, select: { sheetId: true } });
  revalidatePath(`/sheets/${photo.sheetId}`);
}
