// Genera plantillas de aportación municipal en salida/plantillas/ (local).
import { generarPlantilla, PLANTILLAS } from "./plantillas";

async function main(): Promise<void> {
  const i = process.argv.indexOf("--bloque");
  const solo = i >= 0 ? [process.argv[i + 1]] : Object.keys(PLANTILLAS);
  for (const b of solo) {
    const ruta = await generarPlantilla(b, "salida/plantillas");
    console.log(`OK ${ruta}`);
  }
}

main().catch((e: unknown) => {
  console.error(`FALLO plantillas: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
