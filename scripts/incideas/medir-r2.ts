// Hito 0 — Medición R2 (solo lectura). No imprime credenciales.
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "node:fs";

function cargarEnv(): void {
  for (const ruta of [".env.local", ".env"]) {
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, "utf8").split("\n")) {
      const m = linea.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}

async function main(): Promise<void> {
  cargarEnv();
  const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bucket = process.env.R2_BUCKET ?? "socideas-data";
  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "" },
  });
  let token: string | undefined;
  let n = 0;
  let bytes = 0;
  const porPrefijo = new Map<string, { n: number; bytes: number }>();
  const prefijoDe = (k: string) => k.split("/").slice(0, 3).join("/");
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of r.Contents ?? []) {
      n++;
      const b = o.Size ?? 0;
      bytes += b;
      const p = prefijoDe(o.Key ?? "");
      const e = porPrefijo.get(p) ?? { n: 0, bytes: 0 };
      e.n++;
      e.bytes += b;
      porPrefijo.set(p, e);
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  const mb = (v: number) => `${(v / 1048576).toFixed(1)} MB`;
  console.log(`bucket=${bucket} objetos=${n} total=${mb(bytes)}`);
  for (const [p, e] of [...porPrefijo.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 20)) {
    console.log(`  ${p}: n=${e.n} ${mb(e.bytes)}`);
  }
}

main().catch((e) => {
  console.error(`FALLO medición R2: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
