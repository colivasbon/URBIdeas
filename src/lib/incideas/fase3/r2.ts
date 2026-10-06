// Fase 3 — Acceso a R2 para INCideas (lectura pública + escritura SDK).
//
// Claves: `incideas/fase3/{bloque}/{edicion}/{ine}.json` (descargas por
// municipio con procedencia y checksum), `incideas/capas/{bloque}/{ine}.geojson`,
// `incideas/export/{snapshot}/{ine}.*`, `incideas/plantillas/{bloque}.xlsx`.
// La escritura exige credenciales de servidor; la lectura es pública.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

export const PREFIJO_FASE3 = "incideas/fase3";

export interface EnvoltorioBloque<T> {
  bloque: string;
  municipio_ine: string;
  fuente: string;
  edicion: string;
  obtenido_en: string;
  licencia: string;
  url_evidencia: string;
  sha256_origen: string | null;
  objetos: T[];
}

function credenciales(): { client: S3Client; bucket: string } {
  const account = process.env.R2_ACCOUNT_ID ?? "";
  const bucket = process.env.R2_BUCKET ?? "";
  if (!account || !bucket || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Faltan R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET en el entorno");
  }
  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    }),
    bucket,
  };
}

export function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

export function claveBloque(bloque: string, edicion: string, ine: string): string {
  const ed = edicion.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "sinedicion";
  return `${PREFIJO_FASE3}/${bloque}/${ed}/${ine}.json`;
}

/** Guarda el envoltorio en R2 y devuelve clave + bytes + sha. Solo servidor/scripts. */
export async function putBloque<T>(bloque: string, edicion: string, ine: string, env: EnvoltorioBloque<T>): Promise<{ clave: string; bytes: number; sha: string }> {
  const { client, bucket } = credenciales();
  const clave = claveBloque(bloque, edicion, ine);
  const cuerpo = JSON.stringify(env);
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: clave, Body: cuerpo, ContentType: "application/json", CacheControl: "public, max-age=86400" })
  );
  return { clave, bytes: Buffer.byteLength(cuerpo), sha: sha256(cuerpo) };
}

/** Lee un envoltorio por su URL pública (sin credenciales). */
export async function getBloquePublico<T>(basePublica: string, clave: string): Promise<EnvoltorioBloque<T> | null> {
  try {
    const r = await fetch(`${basePublica}/${clave}`, { headers: { "User-Agent": "INCideas-Fase3/0.1" } });
    if (!r.ok) return null;
    return (await r.json()) as EnvoltorioBloque<T>;
  } catch {
    return null;
  }
}

/** Descarga binaria con límite de tamaño (defensa ante respuestas gigantes). */
export async function descargarBinario(url: string, maxBytes: number, timeoutMs = 60000): Promise<{ buf: Buffer; contentType: string } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": "INCideas-Fase3/0.1" }, signal: controller.signal });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) return { error: `excede maxBytes (${buf.length})` };
    return { buf, contentType: r.headers.get("content-type") ?? "" };
  } catch (e: unknown) {
    return { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

export async function leerObjetoS3(clave: string, maxBytes = 200 * 1024 * 1024): Promise<Buffer> {
  const { client, bucket } = credenciales();
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
  const partes: Buffer[] = [];
  let total = 0;
  const cuerpo = r.Body as AsyncIterable<Uint8Array> | undefined;
  if (!cuerpo || typeof cuerpo[Symbol.asyncIterator] !== "function") throw new Error("cuerpo S3 no iterable");
  for await (const trozo of cuerpo) {
    total += trozo.length;
    if (total > maxBytes) throw new Error("objeto excede maxBytes");
    partes.push(Buffer.from(trozo));
  }
  return Buffer.concat(partes);
}
