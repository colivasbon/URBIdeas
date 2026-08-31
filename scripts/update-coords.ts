import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_URL = 'postgresql://postgres.nkfepxuyrbcxolljykwk:ClaveUrb12-@aws-1-eu-west-1.pooler.supabase.com:6543/postgres';
const JSON_PATH = join(__dirname, 'data', 'municipios-ine.json');
const BATCH_SIZE = 1000;

interface Municipio {
  codigo_ine: string;
  lat: number;
  lng: number;
}

async function main() {
  const raw = readFileSync(JSON_PATH, 'utf-8');
  const municipios: Municipio[] = JSON.parse(raw);

  console.log(`Loaded ${municipios.length} municipalities from JSON`);

  const sql = postgres(DB_URL, { ssl: 'require' });

  let updated = 0;

  for (let i = 0; i < municipios.length; i++) {
    const m = municipios[i];

    await sql`
      UPDATE municipios
      SET geom = ST_SetSRID(ST_MakePoint(${m.lng}, ${m.lat}), 4326)
      WHERE codigo_ine = ${m.codigo_ine}
    `;

    updated++;

    if (updated % BATCH_SIZE === 0) {
      console.log(`Progress: ${updated}/${municipios.length}`);
    }
  }

  console.log(`Done. Total updated: ${updated}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
