-- Migration 021: Limpiar capas no verificadas y mantener solo las que funcionan
-- Eliminar capas con URLs incorrectas o nombres genéricos no verificados

-- Eliminar capas de La Rioja (URL con espacio, status pending)
DELETE FROM geo_layers WHERE service_id IN (
  SELECT id FROM geo_services WHERE ccaa = 'La Rioja'
);

-- Eliminar capas genéricas no verificadas de CCAA que no son Cataluña, CyL, Murcia, País Vasco
DELETE FROM geo_layers WHERE layer_name IN ('Clasificacion_Suelo', 'Limites', 'Redes', 'Sectores', 'Suelo_Urbanizable', 'Suelo_Urbano', 'Usos_Suelo', 'LimiteMunicipal', 'SIGCARRETEROS', 'capas_base', 'SQM', 'Calificaciones', 'Suelo_Rustico', 'Unidades_Actuacion', 'Planeamiento', 'Servicios_SRS')
AND service_id IN (
  SELECT id FROM geo_services WHERE ccaa NOT IN ('Cataluña', 'Comunidad Foral de Navarra', 'Región de Murcia', 'España', 'Castilla y León', 'País Vasco')
);

-- Verificar cuántas capas quedan
SELECT gs.ccaa, COUNT(gl.id) as layers
FROM geo_services gs
LEFT JOIN geo_layers gl ON gl.service_id = gs.id
WHERE gl.id IS NOT NULL
GROUP BY gs.ccaa
ORDER BY gs.ccaa;
