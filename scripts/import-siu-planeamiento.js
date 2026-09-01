/**
 * Script de importación de datos de planeamiento del SIU estatal
 * 
 * Consulta el servicio ArcGIS REST del SIU y almacena los datos
 * en la tabla siu_planeamiento de Supabase.
 * 
 * Uso: node scripts/import-siu-planeamiento.js
 * 
 * Variables de entorno requeridas:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// Configuración
const SIU_ARCGIS_URL = 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Planeamiento_Vigente/MapServer/1/query';
const BATCH_SIZE = 500; // Registros por petición
const DELAY_BETWEEN_BATCHES = 1000; // 1 segundo entre lotes para no sobrecargar el servidor

// Verificar variables de entorno
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Variables de entorno NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Función para hacer fetch al servicio ArcGIS REST
function fetchSIU(where = '1=1', offset = 0) {
  const params = new URLSearchParams({
    where,
    outFields: '*',
    f: 'json',
    resultRecordCount: BATCH_SIZE,
    resultOffset: offset,
    returnGeometry: 'false'
  });

  const url = `${SIU_ARCGIS_URL}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Error parsing JSON: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Función para obtener el total de registros
async function getTotalCount() {
  const params = new URLSearchParams({
    where: '1=1',
    returnCountOnly: 'true',
    f: 'json'
  });

  const url = `${SIU_ARCGIS_URL}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.count);
        } catch (e) {
          reject(new Error(`Error parsing JSON: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Función para extraer código INE del ProvMunText
function extractCodigoINE(provMunText) {
  if (!provMunText) return null;
  // ProvMunText tiene formato "28079" (5 dígitos: 2 provincia + 3 municipio)
  const cleaned = provMunText.trim();
  if (/^\d{5}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

// Función para mapear datos del SIU a nuestro modelo
function mapSIUData(feature) {
  const attrs = feature.attributes;
  
  return {
    codigo_ine: extractCodigoINE(attrs.ProvMunText),
    municipio_nombre: attrs.nombre || '',
    figura_vigente: attrs.FiguraVigente || '',
    fecha_figura: attrs.FechaFigura || null,
    observaciones: attrs.observaciones || '',
    comentario_visor: attrs.ComentarioVisor || '',
    texto_link: attrs.textolink || '',
    url_link: attrs.UrlLink || '',
    fuente_datos: 'SIU',
    ultima_sincronizacion: new Date().toISOString()
  };
}

// Función para insertar/actualizar datos en lotes
async function upsertBatch(records) {
  if (records.length === 0) return { inserted: 0, updated: 0, errors: 0 };

  const { data, error } = await supabase
    .from('siu_planeamiento')
    .upsert(records, {
      onConflict: 'codigo_ine',
      ignoreDuplicates: false
    });

  if (error) {
    console.error('Error en upsert:', error.message);
    return { inserted: 0, updated: 0, errors: records.length };
  }

  return { inserted: records.length, updated: 0, errors: 0 };
}

// Función principal de importación
async function importSIUData() {
  console.log('🚀 Iniciando importación de datos del SIU...');
  console.log(`📡 URL del servicio: ${SIU_ARCGIS_URL}`);
  
  try {
    // Obtener total de registros
    const total = await getTotalCount();
    console.log(`📊 Total de municipios en el SIU: ${total}`);
    
    let offset = 0;
    let processed = 0;
    let totalInserted = 0;
    let totalErrors = 0;
    let batchNumber = 0;
    
    while (offset < total) {
      batchNumber++;
      console.log(`\n🔄 Lote ${batchNumber}: Procesando registros ${offset + 1} - ${Math.min(offset + BATCH_SIZE, total)}...`);
      
      // Obtener datos del lote actual
      const result = await fetchSIU('1=1', offset);
      
      if (!result.features || result.features.length === 0) {
        console.log('⚠️ No se encontraron más registros');
        break;
      }
      
      // Mapear datos
      const records = result.features
        .map(mapSIUData)
        .filter(r => r.codigo_ine && r.municipio_nombre); // Solo registros válidos
      
      console.log(`  📋 Registros válidos en este lote: ${records.length}`);
      
      // Insertar en base de datos
      const upsertResult = await upsertBatch(records);
      totalInserted += upsertResult.inserted;
      totalErrors += upsertResult.errors;
      
      processed += result.features.length;
      offset += BATCH_SIZE;
      
      console.log(`  ✅ Procesados: ${processed}/${total} (${Math.round(processed/total*100)}%)`);
      
      // Esperar entre lotes para no sobrecargar el servidor
      if (offset < total) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    // Registrar job de sincronización
    await supabase.from('sync_jobs').insert({
      source_type: 'siu',
      source_name: 'SIU Estatal - Planeamiento Vigente',
      status: totalErrors === 0 ? 'success' : 'partial',
      last_sync: new Date().toISOString(),
      changes_detected: totalInserted,
      details: {
        total_records: total,
        processed: processed,
        inserted: totalInserted,
        errors: totalErrors,
        batches: batchNumber
      }
    });
    
    console.log('\n✅ Importación completada:');
    console.log(`   📊 Total procesados: ${processed}`);
    console.log(`   ✅ Insertados/Actualizados: ${totalInserted}`);
    console.log(`   ❌ Errores: ${totalErrors}`);
    
    return { success: true, total, processed, inserted: totalInserted, errors: totalErrors };
    
  } catch (error) {
    console.error('\n❌ Error durante la importación:', error.message);
    
    // Registrar error en sync_jobs
    await supabase.from('sync_jobs').insert({
      source_type: 'siu',
      source_name: 'SIU Estatal - Planeamiento Vigente',
      status: 'error',
      last_sync: new Date().toISOString(),
      error_message: error.message
    });
    
    return { success: false, error: error.message };
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  importSIUData()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 Importación exitosa');
        process.exit(0);
      } else {
        console.log('\n💥 Importación fallida');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Error inesperado:', err);
      process.exit(1);
    });
}

module.exports = { importSIUData };
