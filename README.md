# Registro Urbanístico España - Ideas Medioambientales

## ¿Qué es este proyecto?

Esta aplicación web muestra un mapa interactivo de España con toda la información urbanística y medioambiental oficial: planes de ordenación, instrumentos de planificación, capas cartográficas de los gouvern autonómicos, licencias de obras, y legislación vigente.

En resumen: un buscador único para encontrar la normativa urbanística de cualquier municipio de España sin tener que navegar por decenas de portales de las Comunidades Autónomas.

---

## ¿Qué necesitas antes de empezar?

Necesitas crear **tres cuentas gratuitas** en internet:

| Servicio | Para qué sirve | Plan | Enlace |
|----------|---------------|------|--------|
| **Supabase** | Base de datos donde se guarda toda la información | Free | https://supabase.com |
| **Vercel** | Donde se ejecuta la aplicación web | Hobby (gratis) | https://vercel.com |
| **GitHub** | Donde está el código del proyecto | Gratis | https://github.com |

### Pasos para crear las cuentas

1. Entra en **supabase.com** y haz clic en "Sign Up". Puedes usar tu correo electrónico o tu cuenta de Google. Una vez dentro, anota tu contraseña en un sitio seguro.

2. Entra en **vercel.com** y haz clic en "Sign Up". Usa la misma cuenta de GitHub o de Google. Plan Hobby es gratis.

3. Si no tienes cuenta de GitHub, entra en **github.com** y crea una con tu correo.

---

## Paso 1: Crear el proyecto en Supabase

1. Entra en https://supabase.com y haz clic en **"New Project"** (botón azul arriba a la derecha).

2. Rellena estos campos:
   - **Organization**: Selecciona la que acabas de crear (o crea una nueva haciendo clic en "Create Organization").
   - **Project name**: Escribe exactamente `urbideas-registro`
   - **Database Password**: Elige una contraseña segura. **Guárdala en un papel.** La necesitarás más adelante.
   - **Region**: Selecciona **Europe (West)** que es la más cercana a España.

3. Haz clic en **"Create new project"**. Espera 1-2 minutos a que se cree.

4. Una vez creado, verás el panel principal. Haz clic en el ícono de **llave inglesa (Settings)** en el menú de la izquierda, luego en **"API"**.

5. Ahí verás dos valores que necesitas copiar y guardar en un papel o en el móvil:
   - **Project URL** (empieza por `https://xxxxxx.supabase.co`)
   - **anon / public key** (una cadena larga que empieza por `eyJ...`)
   - **service_role key** (otra cadena larga que empieza por `eyJ...`). **Esta es secreta. No la compartas nunca.**

---

## Paso 2: Ejecutar las migraciones de la base de datos

Las migraciones son unos scripts que crean todas las tablas necesarias en Supabase. Tienes que ejecutarlas **en orden**.

1. En el panel de Supabase, haz clic en **"SQL Editor"** en el menú de la izquierda (parece una hoja de código).

2. Verás un cuadro de texto grande. Borra lo que haya ahí.

3. Abre la carpeta `supabase/migrations/` de tu proyecto. Verás archivos numerados del `001` al `010`. Tienes que abrir cada uno **por orden** y copiar su contenido completo.

4. Para cada archivo de migración:

   a. Abre el archivo (por ejemplo, `001_crear_usuarios.sql`) con el Bloc de Notas o el editor que uses.
   
   b. Selecciona todo el contenido (Ctrl+A) y cópialo (Ctrl+C).
   
   c. En el SQL Editor de Supabase, pega el contenido (Ctrl+V).
   
   d. Haz clic en el botón **"Run"** (o presiona Ctrl+Enter).
   
   e. Espera a que aparezca un mensaje verde de "Success" o "Query executed successfully".
   
   f. Borra el contenido del editor y repite con el siguiente archivo.

5. Repite este proceso con los 10 archivos, **siempre en orden**:
   - `001_crear_usuarios.sql`
   - `002_crear_municipios.sql`
   - `003_crear_planes.sql`
   - `004_crear_instrumentos.sql`
   - `005_crear_capas_wms.sql`
   - `006_crear_licencias.sql`
   - `007_crear_legislacion.sql`
   - `008_crear_fuentes_geoportales.sql`
   - `009_crear_datos_geograficos.sql`
   - `010_crear_funciones.sql`

6. Si en algún momento aparece un error, **no te preocupes**. Lee el mensaje de error, verifica que estás ejecutando el archivo en orden correcto, y vuelve a intentarlo.

---

## Paso 3: Conectar con Vercel y desplegar

1. Entra en https://vercel.com y haz clic en **"Add New..." → "Project"**.

2. Haz clic en la pestaña **"Import Git Repository"**.

3. Verás una lista de tus repositorios de GitHub. Busca el repositorio **URBIdeas** y haz clic en **"Import"**.

4. En la pantalla de configuración, antes de desplegar, haz clic en **"Environment Variables"** (o "Add" junto a Variables de Entorno).

5. Añade estas tres variables una por una, pegando los valores que guardaste en el Paso 1:

   **Variable 1:**
   - Nombre: `NEXT_PUBLIC_SUPABASE_URL`
   - Valor: Tu Project URL de Supabase (algo como `https://abcdefghij.supabase.co`)
   - Haz clic en "Add"

   **Variable 2:**
   - Nombre: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Valor: Tu anon key de Supabase (la cadena larga que empieza por `eyJ...`)
   - Haz clic en "Add"

   **Variable 3:**
   - Nombre: `SUPABASE_SERVICE_ROLE_KEY`
   - Valor: Tu service_role key de Supabase (la otra cadena larga)
   - Haz clic en "Add"

6. Ahora haz clic en **"Deploy"** (botón azul).

7. Espera 2-3 minutos a que se construya y despliegue la aplicación. Verás una barra de progreso.

8. Cuando termine, verás la dirección web de tu aplicación (algo como `urbideas.vercel.app`). Haz clic en ella para abrirla.

**¡Enhorabuena!** Tu aplicación ya está funcionando en internet.

---

## Paso 4: Usar la aplicación

### El Dashboard

Al abrir la aplicación, verás un panel principal con:
- Un mapa de España a la derecha.
- Un buscador arriba.
- Tarjetas con estadísticas (número de municipios, planes, capas WMS activas, etc.).

### Buscar un municipio

1. Haz clic en la **lupa** que hay arriba a la izquierda.
2. Escribe el nombre del municipio (por ejemplo, "Madrid", "Valencia", "Sevilla").
3. Selecciona el municipio de la lista que aparece.
4. El mapa se centrará en ese municipio y mostrará la información urbanística disponible.

### Usar el visor de mapas

1. En el mapa, puedes hacer clic en las **capas** que aparecen en la esquina superior derecha para activar o desactivar la información que se muestra.
2. Puedes hacer zoom con la rueda del ratón o con los botones +/-.
3. Si haces clic en un punto del mapa, se abrirá un panel con los detalles de ese punto (plan asociado, instrumento, etc.).

### Ver legislación

1. En el menú de navegación, haz clic en **"Legislación"**.
2. Verás una lista de leyes, decretos y normativas ordenadas por fecha.
3. Puedes filtrar por Comunidad Autónoma o por tipo de normativa.
4. Haz clic en un resultado para ver el contenido completo.

---

## Documentación de la API

Si necesitas consultar los datos programáticamente (por ejemplo, desde otra aplicación), la API está documentada en la dirección:

**https://urbideas.vercel.app/api-docs**

Allí encontrarás todos los endpoints disponibles, los parámetros que aceptan, y ejemplos de uso.

---

## ⚠️ ¿Qué hacer si un WMS deja de funcionar?

Los WMS (Web Map Services) son las fuentes de datos cartográficos de las Comunidades Autónomas. A veces cambian de dirección o se caen. Esto es lo que tienes que hacer:

### Cómo saber si un WMS no funciona

1. En el mapa, la capa correspondiente aparecerá **vacía** (sin datos).
2. Puede aparecer un mensaje de error en la consola del navegador (presiona F12 para abrirla).
3. En el panel de administración, la capa aparecerá marcada como "inactiva" o con una fecha de verificación antigua.

### Cómo comprobar manualmente si un WMS funciona

1. Abre el navegador (Chrome, Firefox, etc.).
2. Escribe la dirección del WMS seguida de `?service=WMS&request=GetCapabilities`. Por ejemplo:
   ```
   https://www.juntadeandalucia.es/.../wms?service=WMS&request=GetCapabilities
   ```
3. Si el WMS funciona, verás un documento XML largo con información técnica.
4. Si no funciona, verás un error 404, 500, o la página no carga.

### Cómo arreglar un WMS que cambió de dirección

1. Entra en la aplicación y ve al **panel de administración** (tienes que tener permisos de administrador).
2. Busca la sección **"Capas WMS"**.
3. Busca la capa que no funciona.
4. Haz clic en **"Editar"**.
5. Actualiza el campo **"URL del servicio"** con la nueva dirección.
6. Haz clic en **"Guardar"**.
7. Espera unos minutos y comprueba que la capa vuelve a funcionar en el mapa.

### Cómo encontrar una nueva dirección de WMS

1. Ve al **geoportal de la Comunidad Autónoma** correspondiente. Aquí tienes los más importantes:

| Comunidad Autónoma | Geoportal principal |
|-------------------|---------------------|
| Andalucía | https://www.juntadeandalucia.es/institutodecartografia |
| Aragón | https://www.aragon.es/gobierno/informacion-territorio |
| Asturias | https://www.asturias.es/temas/medio-ambiente/territorio |
| Islas Baleares | https://www.caib.es/government/territoriomedioambiente |
| Canarias | https://www.gobcan.es/territorio |
| Cantabria | https://www.cantabria.es/territorio |
| Castilla-La Mancha | https://www.castillalamancha.es/territorio |
| Castilla y León | https://www.cyL.es/territorio |
| Cataluña | https://www.icgc.cat |
| Extremadura | https://www.juntaex.es/territorio |
| Galicia | https://www.xunta.gal/territorio |
| Comunidad de Madrid | https://www.comunidad.madrid/gobierno/medio-ambiente |
| Región de Murcia | https://www.carm.es/territorio |
| Navarra | https://www.navarra.es/es/territorio |
| País Vasco | https://www.euskadi.eus/territorio |
| La Rioja | https://www.larioja.es/territorio |
| Comunidad Valenciana | https://www.gva.es/es/temas/territorio |

2. Busca la sección **"Servicios de datos"**, **"Visor cartográfico"** o **"API / WMS"**.
3. Suele estar en un apartado llamado "Descargas", "Servicios" o "Datos abiertos".
4. Copia la dirección del servicio WMS.
5. Sigue los pasos anteriores para actualizarla en la aplicación.

### Si no consigues encontrar el WMS

Contacta con el soporte técnico de la Comunidad Autónoma. La mayoría tienen un correo electrónico de soporte técnico o un teléfono de atención al ciudadano.

---

## Mejoras previstas

Este proyecto está en continua evolución. Las mejoras que se están considerando son:

- **Visor de documentos PDF**: Ver los documentos de planes e instrumentos directamente en el navegador sin tener que descargarlos.
- **Alertas por email**: Recibir un aviso cuando se publique un nuevo plan o cuando una capa WMS deje de funcionar.
- **Exportación de datos**: Descargar la información urbanística de un municipio en formato CSV o Excel.
- **App móvil**: Una aplicación para Android e iOS que permita consultar la información desde el móvil.
- **Comparador de municipios**: Comparar la información urbanística de dos municipios lado a lado.
- **Historial de cambios**: Ver qué ha cambiado en un municipio a lo largo del tiempo (nuevos planes, modificaciones, etc.).

---

## Créditos

Este proyecto ha sido desarrollado por **Ideas Medioambientales**.

Ideas Medioambientales es una empresa dedicada a la consultoría ambiental y al desarrollo de herramientas digitales para la gestión del territorio.

Para más información, contacta con nosotros a través de la página web de la empresa.

---

*Última actualización: 2026*
