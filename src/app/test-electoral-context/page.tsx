import { ElectoralContext } from "@/components/socideas/ElectoralContext";
import { getMunicipalElection, getMunicipalElectionSeries } from "@/lib/elections-consumer";
import { HemicycleRepresentation } from "@/components/socideas/HemicycleRepresentation";
import { ElectoralComparison } from "@/components/socideas/ElectoralComparison";

export default async function TestPage() {
  // Cargar datos de Albacete 2023 y 2019
  const elections = await getMunicipalElectionSeries("02003");
  const current = elections.find((e) => e.election_year === 2023);
  const previous = elections.find((e) => e.election_year === 2019);

  if (!current || !previous) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1>Datos electorales de Albacete</h1>
        <p>No hay datos disponibles. Verifica que la carga haya completado.</p>
        <p>Datos encontrados: {elections.length}</p>
        {elections.map((e) => (
          <p key={e.election_date}>
            {e.election_year}: {e.candidacies.length} candidaturas, {e.summary.representatives_total} concejales
          </p>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Prueba electoral: Albacete 02003</h1>

      <section style={{ marginTop: "2rem" }}>
        <h2>Contexto electoral actual</h2>
        <ElectoralContext elections={elections} municipalityName="Albacete" />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Ayuntamiento 2023</h2>
        <HemicycleRepresentation election={current} />
      </section>

      {previous && (
        <>
          <section style={{ marginTop: "2rem" }}>
            <h2>Ayuntamiento 2019</h2>
            <HemicycleRepresentation election={previous} />
          </section>

          <section style={{ marginTop: "2rem" }}>
            <h2>Comparación 2023 vs 2019</h2>
            <ElectoralComparison current={current} previous={previous} />
          </section>
        </>
      )}

      <section style={{ marginTop: "2rem" }}>
        <h2>Metadatos</h2>
        <pre style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "6px", overflow: "auto" }}>
          {JSON.stringify(
            {
              current: {
                date: current.election_date,
                candidacies: current.candidacies.length,
                seats: current.summary.representatives_total,
                source: current.source.publisher,
              },
              previous: {
                date: previous.election_date,
                candidacies: previous.candidacies.length,
                seats: previous.summary.representatives_total,
                source: previous.source.publisher,
              },
            },
            null,
            2
          )}
        </pre>
      </section>
    </div>
  );
}
