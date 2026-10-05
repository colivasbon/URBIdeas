# Línea de base de INCideas — Benidorm (03031)

Reproduce las cifras del Excel adjunto y las reconcilia con el libro municipal nuevo. Todas las cifras salen de leer los ficheros, sin estimaciones.

## Ficheros comprobados

- Adjunto: `INCIDEAS DOCUMENTOS\incideas_03031_todos.xlsx`
  - SHA-256: `CA3A009D2D6D10B4372B5FFA5F9FE9A1CB516AA38A230DE0653D5D6A5C5E940E`
- Libro nuevo: `salida\incideas_03031\Benidorm_03031_inventario.csv`

## Estructura del adjunto

- Hojas: «Registros», «Léame» (2)
- Columnas: 20
- Filas de datos en «Registros»: 1378
- Columnas: id, codigo_ine, categoria, subcategoria, nombre, direccion, lat, lng, geometria_wkt, crs, fuente, id_origen, huella, fecha_dato, fecha_consulta, estado_validacion, estado_espacial, licencia, advertencias, posible_baja_desde

## Coordenadas

- Filas con latitud y longitud: 1110
- Filas sin ambas coordenadas: 268
- Comprobación: 1110 + 268 = 1378 de 1378
- Cifra esperada en el encargo: 1.110 con coordenadas y 268 sin ellas.
- Resultado: coincide.

## Estado de validación

  automatico_sin_revisar        940
  contrastado                   437
  validado_tecnicamente           1

## Estado espacial

  valido                        747
  sin_geometria                 268
  proximo_limite                264
  fuera_municipio                99

## Nombres

- Nombres constituidos únicamente por cifras: 42
- Cifra esperada en el encargo: 42. Resultado: coincide.
- Ejemplos: «24» (infraestructuras/parada_autobus), «4» (territorio/partida), «3» (territorio/partida), «2» (territorio/partida), «26» (infraestructuras/parada_autobus), «3» (territorio/partida), «3» (territorio/partida), «2» (territorio/partida)

## Huellas repetidas

- Grupos de huellas repetidas: 62 (esperado 62)
- Filas dentro de esos grupos: 165 (esperado 165)
- Repeticiones adicionales por combinación fuente + huella: 103 (esperado 103)

Repeticiones por fuente:
    P                              62

Filas implicadas por categoría:
    territorio                    157
    equipamientos                   8

## Diagnóstico de las repeticiones

Causa de cada repetición, comprobada sobre las filas, no supuesta:

- Filas caducadas por el cambio de forma de la clave: 62 filas
  Cada grupo tiene exactamente una fila caducada. Se distinguen por tener tres campos en el identificador de origen, donde las activas tienen cuatro: son las filas importadas antes de que el área formara parte de la clave de la partida. Al cambiar la clave de importación, la segunda carga no actualizó las filas anteriores sino que creó otras. Es la misma entidad física documentada dos veces, y así consta: marcada como posible baja y nunca borrada.
    · id=e4d141d8 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|3|La Mitja Llengua nombre=«La Mitja Llengua» cat=territorio/partida
    · id=a5ae52ab fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|4|Foia del Veradder nombre=«Foia del Veradder» cat=territorio/partida
    · id=1a69316d fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|4|Foia del Bol nombre=«Foia del Bol» cat=territorio/partida
    · id=d54efaa9 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|2|El Saladar nombre=«El Saladar» cat=territorio/partida
    · id=fc772537 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|2|Pla del Quarter nombre=«Pla del Quarter» cat=territorio/partida
- Entidades distintas que comparten huella, que no son duplicados: 103 filas
  Las 103 repeticiones adicionales son filas activas con identificador de origen propio y distinto entre sí. Una partida puede abarcar varias áreas y la plantilla documenta esa situación; la huella lleva la fuente dentro, así que dos filas de la misma partida con áreas distintas comparten valor de huella sin ser el mismo elemento. Fusionarlas sería incorrecto.
    · id=00563359 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|3|La Mitja Llengua|3 nombre=«La Mitja Llengua» cat=territorio/partida
    · id=01289e27 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|4|Foia del Veradder|11 nombre=«Foia del Veradder» cat=territorio/partida
    · id=fe1ae7f4 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|4|Foia del Veradder|1 nombre=«Foia del Veradder» cat=territorio/partida
    · id=012cb965 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|4|Foia del Bol|2 nombre=«Foia del Bol» cat=territorio/partida
    · id=581e042e fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|4|Foia del Bol|10 nombre=«Foia del Bol» cat=territorio/partida
- Filas cuyo nombre es el nombre de una columna: 2 filas
  El nombre de la fila es literalmente el nombre de una columna. Corresponde a la fila 83 de la hoja Núcleos_partidas de la plantilla municipal, que es un encabezado repetido en mitad de los datos.
    · id=1058ea74 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|Subsector|Distrito nombre=«Distrito» cat=territorio/partida
    · id=66786e57 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|Subsector|Distrito| nombre=«Distrito» cat=territorio/partida
- Forma de la clave de cada caducada, por subcategoría: 62 filas
  Las 62 filas caducadas se reparten en dos claves antiguas distintas, según la subcategoría: las partidas usaban «partida|distrito|nombre» (58 filas, tres campos) y ahora usan «partida|distrito|nombre|área» (cuatro campos); las farmacias usaban el nombre, que casi todas las filas comparten, y ahora usan la dirección (4 filas, dos campos en ambos casos). Coincide exactamente con las 58 + 4 filas caducadas que hay, y confirma que el cambio de clave es la causa y no una coincidencia.
    · id=e4d141d8 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|3|La Mitja Llengua nombre=«La Mitja Llengua» cat=territorio/partida
    · id=a5ae52ab fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|4|Foia del Veradder nombre=«Foia del Veradder» cat=territorio/partida
    · id=1a69316d fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|4|Foia del Bol nombre=«Foia del Bol» cat=territorio/partida
    · id=d54efaa9 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|2|El Saladar nombre=«El Saladar» cat=territorio/partida
    · id=fc772537 fuente=Plantilla municipal — Limpieza info (PTM id_origen=partida|2|Pla del Quarter nombre=«Pla del Quarter» cat=territorio/partida

## Reconciliación con el libro nuevo

- Filas en el libro nuevo: 1269
- Con coordenadas en el libro nuevo: 1111 (esperado 1.111)
- Sin coordenadas en el libro nuevo: 158
- Diferencia de filas con coordenadas: 1
- Filas del adjunto que no aparecen en el libro nuevo por id: 109
- Filas del libro nuevo que no aparecen en el adjunto por id: 0
- Filas cuya presencia de coordenadas cambió entre adjunto y libro nuevo: 1

- territorio/limite_municipal «Benidorm» fuente=OpenStreetMap (Nominatim) id_origen=osm:relation/341148 → adjunto: sin coordenadas, nuevo: con coordenadas
