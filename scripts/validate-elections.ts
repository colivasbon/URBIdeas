// Validación de datos electorales cargados en R2

import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { MunicipalElection } from "../src/lib/elections-schema";

const env_local = join(process.cwd(), ".env.local");
if (!existsSync(env_local)) {
  console.error("[ERROR] No .env.local");
  process.exit(1);
}

const env_text = readFileSync(env_local, "utf-8");
const env: Record<string, string> = {};
for (const line of env_text.split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = env.R2_BUCKET || "socideas-data";

async function validateElections(date: string) {
  const prefix = `socideas/elections/normalized/municipal/${date}/`;
  console.log(`[VALIDATE] ${date}: Listando objetos en ${prefix}`);

  let count = 0;
  let bytes = 0;
  let valid = 0;
  let errors = 0;
  let continuation_token: string | undefined;

  while (true) {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuation_token,
        MaxKeys: 100,
      })
    );

    if (!result.Contents) break;

    for (const obj of result.Contents) {
      if (!obj.Key || obj.Key.endsWith("/")) continue;

      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
        const body = await res.Body?.transformToString();

        if (body) {
          count++;
          bytes += body.length;

          const parsed = JSON.parse(body) as MunicipalElection;
          if (parsed.municipality && parsed.candidacies && parsed.election_date === date) {
            valid++;
          } else {
            console.error(`[ERROR] ${obj.Key}: Estructura inválida`);
            errors++;
          }
        }
      } catch (e) {
        console.error(`[ERROR] ${obj.Key}: ${e}`);
        errors++;
      }

      if (count % 500 === 0) {
        console.log(`  [${count}] ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
      }
    }

    if (!result.IsTruncated) break;
    continuation_token = result.NextContinuationToken;
  }

  console.log(`\n[RESULTADOS] ${date}`);
  console.log(`  Objetos: ${count}`);
  console.log(`  Válidos: ${valid}`);
  console.log(`  Errores: ${errors}`);
  console.log(`  Bytes: ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
}

async function main() {
  const args = process.argv.slice(2);
  const date = args[0];

  if (!date) {
    console.error("Uso: npx tsx scripts/validate-elections.ts <fecha>");
    console.error("Ejemplo: npx tsx scripts/validate-elections.ts 2023-05-28");
    process.exit(1);
  }

  try {
    await validateElections(date);
  } catch (e) {
    console.error("[FATAL]", e);
    process.exit(1);
  }
}

main();
