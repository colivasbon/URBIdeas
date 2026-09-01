-- Migration 022: Limpiar duplicados y mantener solo capas de suelo relevantes

-- Eliminar capas genéricas no verificadas que se quedaron de antes
DELETE FROM geo_layers WHERE layer_name IN ('Clasificacion_Suelo', 'Limites', 'Redes', 'Sectores', 'Suelo_Urbanizable', 'Suelo_Urbano', 'Usos_Suelo', 'LimiteMunicipal', 'SIGCARRETEROS', 'capas_base', 'SQM', 'Calificaciones', 'Suelo_Rustico', 'Unidades_Actuacion', 'Planeamiento', 'Servicios_SRS')
AND service_id IN (SELECT id FROM geo_services WHERE ccaa NOT IN ('Cataluña', 'Comunidad Foral de Navarra', 'Región de Murcia', 'España', 'Castilla y León', 'País Vasco'));

-- Eliminar capas duplicadas de Aragón (mantener solo las más relevantes)
DELETE FROM geo_layers WHERE layer_name IN ('clasificaciondelsuelo_idearagon', 'clasificacion', 'clasificacion_SNUE', 'clasificacion_SNUE_noSist_idearagon', 'clasificacion_SNUE_sist', 'clasificacion_SNUE_noSist', 'prueba_clasificacion')
AND service_id IN (SELECT id FROM geo_services WHERE ccaa = 'Aragón');

-- Eliminar capas duplicadas de Murcia (mantener solo las de clasificación de suelo)
DELETE FROM geo_layers WHERE layer_name LIKE 'plu_prot_%'
AND service_id IN (SELECT id FROM geo_services WHERE ccaa = 'Región de Murcia');

-- Eliminar capas de protección de Murcia que ya tenemos
DELETE FROM geo_layers WHERE layer_name IN ('plu_prot_amb_pto', 'plu_prot_arq_pto', 'plu_prot_bot_pol', 'plu_prot_bot_pto', 'plu_prot_can_pol', 'plu_prot_can_pto', 'plu_prot_cau_lin', 'plu_prot_cau_pol', 'plu_prot_com_lin', 'plu_prot_com_pol', 'plu_prot_esp_pol', 'plu_prot_esp_pto', 'plu_prot_etn_pol', 'plu_prot_etn_pto', 'plu_prot_geo_pol', 'plu_prot_geo_pto', 'plu_prot_his_pol', 'plu_prot_his_pto', 'plu_prot_inf_lin', 'plu_prot_inf_pol', 'plu_prot_min_pol', 'plu_prot_min_pto', 'plu_prot_pal_pol', 'plu_prot_pal_pto')
AND service_id IN (SELECT id FROM geo_services WHERE ccaa = 'Región de Murcia');

-- Eliminar capas de Navarra que no son de suelo
DELETE FROM geo_layers WHERE layer_name LIKE 'RUIDOS_%' OR layer_name LIKE 'POLUCI_%' OR layer_name LIKE 'FOREST_%' OR layer_name LIKE 'SOCIAL_%' OR layer_name LIKE 'DOTACI_%' OR layer_name LIKE 'INFRAE_%' OR layer_name LIKE 'tuc%' OR layer_name LIKE 'NBUS%' OR layer_name LIKE 'CARBTU_%' OR layer_name LIKE 'PATRIM_%' OR layer_name LIKE 'CATAST_%' OR layer_name LIKE 'EDAFOL_%' OR layer_name LIKE 'AGRICU_%' OR layer_name LIKE 'REGADI_%' OR layer_name LIKE 'OCUPAC_%' OR layer_name LIKE 'PARFLU_%' OR layer_name LIKE 'AGROAL_%' OR layer_name LIKE 'mobUrbano%' OR layer_name LIKE 'carto1000sueloTematizado' OR layer_name LIKE 'otrasZonificaciones' OR layer_name LIKE 'zonificacionJudicial' OR layer_name LIKE 'zonificacionLinguistica'
AND service_id IN (SELECT id FROM geo_services WHERE ccaa = 'Comunidad Foral de Navarra');

-- Eliminar capas de Asturias que no son de suelo
DELETE FROM geo_layers WHERE layer_name IN ('n01_AMBITO_INSTRUMENTO_CONSULTAS', 'n01_AMBITO_INSTRUMENTO_CONSULTAS2', 'n07_SIST_GENERALES_AREAS', 'n08_SIST_GENERALES_LINEALES', 'n12_USOS_PORMENORIZADOS', 'n13_SIST_LOCALES_AREAS', 'n15_UNIDADES_GESTION', 'n22_INSTRUMENTOS_PLANEAMIENTO', 'n23_ELEM_CATALOGADOS_AREAS', 'n24_ELEM_CATALOGADOS_LINEALES', 'n25_AREAS_MODIF_URBANISTICAS', 'n27_BICS', 'n30_DOMINIOS_PUBLICOS', 'n31_SERVIDUMBRES')
AND service_id IN (SELECT id FROM geo_services WHERE ccaa = 'Asturias');

-- Verificar resultado final
SELECT gs.ccaa, COUNT(gl.id) as layers
FROM geo_services gs
LEFT JOIN geo_layers gl ON gl.service_id = gs.id
WHERE gl.id IS NOT NULL
GROUP BY gs.ccaa
ORDER BY gs.ccaa;
