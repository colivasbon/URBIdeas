const shapefile = require('shapefile');
const turf = require('@turf/turf');
const fs = require('fs');
const path = require('path');

const SHP_DIR = 'C:/Users/Carlos/Documents/URBIdeas/clases_suelo_epsg_4258_130720';
const OUTPUT_DIR = 'C:/Users/Carlos/Documents/GitHub/URBIdeas/public/data/soil';

const PROVINCE_NAMES = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería',
  '05': 'Ávila', '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona',
  '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
  '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid',
  '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
  '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'S/C Tenerife', '39': 'Cantabria', '40': 'Segovia',
  '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
  '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Bizkaia',
  '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla'
};

const PROV_TO_CCAA = {
  '01': 'País Vasco', '02': 'Castilla-La Mancha', '03': 'Comunitat Valenciana', '04': 'Andalucía',
  '05': 'Castilla y León', '06': 'Extremadura', '07': 'Islas Baleares', '08': 'Cataluña',
  '09': 'Castilla y León', '10': 'Extremadura', '11': 'Andalucía', '12': 'Comunitat Valenciana',
  '13': 'Castilla-La Mancha', '14': 'Andalucía', '15': 'Galicia', '16': 'Castilla-La Mancha',
  '17': 'Cataluña', '18': 'Andalucía', '19': 'Castilla-La Mancha', '20': 'País Vasco',
  '21': 'Andalucía', '22': 'Aragón', '23': 'Andalucía', '24': 'Castilla y León',
  '25': 'Cataluña', '26': 'La Rioja', '27': 'Galicia', '28': 'Comunidad de Madrid',
  '29': 'Andalucía', '30': 'Región de Murcia', '31': 'Comunidad Foral de Navarra', '32': 'Galicia',
  '33': 'Principado de Asturias', '34': 'Castilla y León', '35': 'Canarias', '36': 'Galicia',
  '37': 'Castilla y León', '38': 'Canarias', '39': 'Cantabria', '40': 'Castilla y León',
  '41': 'Andalucía', '42': 'Castilla y León', '43': 'Cataluña', '44': 'Aragón',
  '45': 'Castilla-La Mancha', '46': 'Comunitat Valenciana', '47': 'Castilla y León', '48': 'País Vasco',
  '49': 'Castilla y León', '50': 'Aragón', '51': 'Ceuta', '52': 'Melilla'
};

async function processSHP() {
  console.log('Reading SHP file...');
  
  const shpPath = path.join(SHP_DIR, 'CLASES_SUELO_EPSG_4258.shp');
  const dbfPath = path.join(SHP_DIR, 'CLASES_SUELO_EPSG_4258.dbf');
  
  const byProvince = {};
  let count = 0;
  
  // Read SHP with shapefile
  const source = await shapefile.open(shpPath, dbfPath);
  let result = await source.read();
  
  while (!result.done) {
    const feature = result.value;
    count++;
    
    if (count % 1000 === 0) {
      console.log(`  Processed ${count} features...`);
    }
    
    const provINE = feature.properties?.ProvINE || '';
    const provCode = provINE.substring(0, 2);
    
    if (!provCode || provCode.length < 2) {
      result = await source.read();
      continue;
    }
    
    if (!byProvince[provCode]) {
      byProvince[provCode] = [];
    }
    
    // Simplify geometry before storing
    const geoJSONFeature = {
      type: 'Feature',
      properties: {
        ClaseSuelo: feature.properties?.ClaseSuelo || '',
        NuclRural: feature.properties?.NuclRural || '',
        AreaLamber: feature.properties?.AreaLamber || 0,
        Shape_STAr: feature.properties?.Shape_STAr || 0,
      },
      geometry: feature.geometry
    };
    
    // Simplify to reduce file size
    try {
      const simplified = turf.simplify(geoJSONFeature, { tolerance: 0.001, highQuality: true });
      byProvince[provCode].push(simplified);
    } catch (e) {
      byProvince[provCode].push(geoJSONFeature);
    }
    
    result = await source.read();
  }
  
  console.log(`Total features: ${count}`);
  console.log('Provinces found:', Object.keys(byProvince).length);
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Process each province
  const manifest = {};
  
  for (const [provCode, features] of Object.entries(byProvince)) {
    const provName = PROVINCE_NAMES[provCode] || `Provincia ${provCode}`;
    const ccaa = PROV_TO_CCAA[provCode] || 'Desconocido';
    
    console.log(`Saving ${provName} (${provCode}) - ${features.length} features...`);
    
    const provGeoJSON = {
      type: 'FeatureCollection',
      features
    };
    
    const filename = `province_${provCode}.geojson`;
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(provGeoJSON));
    
    const fileSize = fs.statSync(filepath).size;
    console.log(`  Saved: ${filename} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
    
    manifest[provCode] = {
      name: provName,
      ccaa,
      filename,
      features: features.length,
      size: fileSize
    };
  }
  
  // Save manifest
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest saved: ${manifestPath}`);
  
  // Summary
  const totalSize = Object.values(manifest).reduce((sum, p) => sum + p.size, 0);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Provinces: ${Object.keys(manifest).length}`);
  console.log(`Total features: ${count}`);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Average per province: ${(totalSize / Object.keys(manifest).length / 1024 / 1024).toFixed(1)} MB`);
}

processSHP().catch(console.error);
