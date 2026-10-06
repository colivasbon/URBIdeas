// Valida un xlsx cumplimentado (solo lectura, informa sin escribir).
import { validarPlantilla } from "./plantillas";

async function main(): Promise<void> {
  const a = (n: string): string | undefined => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const bloque = a("--bloque") ?? "";
  const archivo = a("--archivo") ?? "";
  if (!bloque || !archivo) throw new Error("Uso: validar.ts --bloque hidrantes --archivo <xlsx>");
  const r = await validarPlantilla(bloque, archivo);
  console.log(`valida=${r.valida} filas=${r.filas}`);
  for (const e of r.errores) console.log(`  ERROR: ${e}`);
  for (const x of r.avisos) console.log(`  AVISO: ${x}`);
  if (!r.valida) process.exit(2);
}

main().catch((e: unknown) => {
  console.error(`FALLO validar: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
