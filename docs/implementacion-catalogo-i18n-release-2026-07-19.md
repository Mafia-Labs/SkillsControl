# Implementación del catálogo, i18n backend y preparación de release

Fecha: 2026-07-19  
Alcance: mejoras pendientes de `fix-discover-catalogo-real.md` y
`hallazgos-i18n-backend.md`, más verificación del checklist de
`plan-v1-lanzamiento.md`.

## Estado final

La pestaña Descubrir consume el catálogo curado real de 248 entradas, conserva
el resultado en memoria durante la sesión, permite filtrar por tecnología y
revela el catálogo por bloques de 30 entradas. Salud y Auto Skills ya no
reciben frases de interfaz hardcodeadas desde Rust: reciben una clave de
traducción y sus parámetros, que React resuelve con el idioma activo en los
siete locales.

El release queda parcialmente preparado: hay CI, configuración de bundles
multiplataforma y un workflow de publicación. El `.dmg` firmado/notarizado y
el updater operativo siguen requiriendo credenciales, una clave pública, un
endpoint de actualizaciones y una decisión de distribución que no existen en
este repositorio. Tampoco se inventaron una landing ni un checkout sin
proveedor, dominio, precios o sistema de licencias definidos.

## 1. Punto de partida y verificación de los documentos

Antes de editar se leyeron, en este orden, los cuatro documentos solicitados:

1. `docs/fix-discover-catalogo-real.md` — el commit `f18d92c` ya había
   conectado Descubrir al catálogo real; quedaban paginación, tests, caché y
   filtro por tecnología.
2. `docs/hallazgos-i18n-backend.md` — confirmó que los hallazgos de Salud y
   las razones de Auto Skills salían en inglés desde Rust.
3. `docs/plan-v1-lanzamiento.md` — se verificó contra el árbol actual, porque
   su estado tenía fecha 2026-07-14.
4. `docs/plan-pm-ux-ciclo-de-vida-skills.md` — se usó solo como contexto de
   los flujos ya implementados de navegación, instalación y desinstalación.

El punto de partida estaba limpio y en verde:

- `pnpm test`: 11 tests pasados.
- `cd src-tauri && cargo test`: 40 pasados y 1 ignorado (test de red).
- `npx tsc -b`: correcto.
- `node scripts/check-locales.mjs`: 7 locales, 359 claves, interpolaciones
  coincidentes.

## 2. Descubrir: catálogo real a escala de producción local

### Cambios

- `src-tauri/src/lib.rs:2120-2150` mantiene `CatalogEntry` como una proyección
  mínima de `SkillList`: id, nombre, descripción, tecnologías y repositorio.
  `list_catalog_skills` sigue descargando/verificando en Rust, pero no expone
  al frontend los pins internos usados para validar el contenido.
- `src-tauri/src/lib.rs:2562-2576` añade una prueba que carga el catálogo
  incluido, comprueba que contiene más de 200 entradas —el fichero actual tiene
  248— y verifica que la serialización de una entrada no contiene `sha256`.
- `src/App.tsx:91-94,140-156` carga el catálogo solo al entrar en Descubrir,
  conserva el resultado en el estado de `App` mientras dura la sesión y
  expone error/reintento al componente. Esto evita repetir la llamada al
  navegar entre vistas y deja el estado de red fuera del componente visual.
- `src/components/Discover.tsx:6-32` define una ventana inicial de 30
  elementos, filtra por texto en nombre/descripción/tecnologías y construye el
  selector con las tecnologías realmente presentes en el catálogo.
- `src/components/Discover.tsx:34-58` muestra carga, error con reintento,
  contador de resultados y el botón “mostrar más”. Cada ampliación añade 30.
- `src/components/Discover.test.ts:53-88` cubre los estados de carga/error,
  el callback de reintento, el límite inicial de 30, la expansión y el filtro
  por tecnología. Se usa ReactDOM directamente porque el repo no tenía una
  librería de testing de componentes.
- `src/styles.css:68` añade el layout del toolbar de tecnología; el cambio es
  puramente visual y no altera el contrato del backend.

### Decisión

Se eligió paginación incremental en memoria en lugar de una virtualización
compleja: 248 tarjetas son manejables con una primera carga de 30 y el usuario
conserva el contexto al buscar o cambiar de tecnología. La caché queda en
`App` y no en `Discover` porque el componente no debe volver a consultar el
backend al desmontarse. La caché es de sesión, no persistente/offline-first:
el catálogo sigue pudiendo actualizarse y el fallback incluido en Rust sigue
siendo la fuente disponible sin red.

## 3. i18n de Salud y Auto Skills

### Contrato backend/frontend

- `src-tauri/src/lib.rs:16-45` introduce `LocalizedText`, con `key` y un
  mapa de `params` serializado en camelCase.
- `src-tauri/src/lib.rs:156-164` cambia `Finding.title` y `Finding.detail` de
  `String` a `LocalizedText`. `src-tauri/src/lib.rs:705-720` centraliza la
  construcción de hallazgos de seguridad con claves.
- `src-tauri/src/lib.rs:1237-1293` localiza también los hallazgos de
  frontmatter, descripción, nombre, tamaño y scripts, incluyendo los
  parámetros dinámicos `folderName`, `skillName` y `paths`.
- `src-tauri/src/lib.rs:1817-1842` aplica el mismo contrato a copias
  divergentes y solapamientos global/proyecto.
- `src-tauri/src/detection.rs:332-347` hace localizables la descripción de una
  recomendación y el texto de cada razón.
- `src-tauri/src/detection.rs:981-1002` convierte dependencia, fichero de
  configuración, extensión y coincidencia de contenido en claves con
  parámetros; `src-tauri/src/detection.rs:804-807` cubre combinaciones y
  `src-tauri/src/detection.rs:842-852` cubre perfiles.
- `src-tauri/src/detection.rs:1005-1026` deja la descripción visible de la
  recomendación bajo `projectDetail.recommendationDescription` y conserva el
  id como parámetro.
- `src-tauri/src/lib.rs:2952` y `src-tauri/src/detection.rs:1301-1322`
  comprueban respectivamente que un hallazgo serializa una clave de Salud y
  que una recomendación conserva la clave y el parámetro de su evidencia.
- `src/lib/types.ts:9-12,39-45,150-160` refleja el contrato en TypeScript.
- `src/components/Health.tsx:13-20` y `src/components/Inspector.tsx:61`
  traducen título y detalle al renderizar y al filtrar.
- `src/components/ProjectDetail.tsx:159-166` y
  `src/components/ChangeModal.tsx:78-83` traducen descripciones y razones de
  Auto Skills también en el detalle y en la confirmación de instalación.
- `src/lib/demo-data.ts:3,45-64` y `src/lib/skill-utils.test.ts:60-64` se ajustan
  al nuevo tipo para que demo y tests ejerciten el mismo contrato que Tauri.

### Locales y decisión de contenido

- `src/locales/en/translation.json:170-190,258-268,290-306` define las nuevas
  claves de hallazgos, razones y Descubrir.
- Las mismas estructuras se actualizaron en
  `src/locales/es/translation.json:170-190,258-268,290-306`,
  `src/locales/fr/translation.json`, `src/locales/zh/translation.json`,
  `src/locales/ja/translation.json`, `src/locales/de/translation.json` y
  `src/locales/pt/translation.json`.
- `node scripts/check-locales.mjs` confirma ahora 7 locales, 413 claves y
  parámetros coincidentes.

La decisión es que Rust emita intención de interfaz, no una traducción. Las
descripciones detalladas del mapa de detección son metadatos editoriales
actualmente escritos en inglés y no existe una tabla de traducción de las 134
skills que contiene el mapa. Para cerrar el bug confirmado sin filtrar inglés
al resto de idiomas, la descripción visible usa una frase localizada con el
`skillId`; la evidencia específica sí conserva sus datos dinámicos y se
traduce por clave. Traducir editorialmente todas las descripciones del mapa es
un trabajo posterior de contenido, no se disfraza aquí de traducción
automática.

## 4. Verificación del checklist de lanzamiento

### Cerrado o preparado en este cambio

- `.github/workflows/ci.yml:1-29` añade CI para pull requests y pushes a
  `main`: pnpm congelado, TypeScript, Vitest, locales, Cargo y build web.
- `.github/workflows/release.yml:1-51` añade publicación por tag `v*` o
  ejecución manual con `tauri-apps/tauri-action`. La matriz cubre Ubuntu,
  macOS (`--bundles dmg`) y Windows (`--bundles nsis`). Los secretos Apple y
  `GITHUB_TOKEN` se leen únicamente desde GitHub Actions.
- `src-tauri/tauri.conf.json:27-30` cambia el target de solo `app` a `all`,
  por lo que el proyecto ya puede generar los formatos nativos de la
  plataforma. La acción de macOS limita explícitamente la publicación a DMG.
- `package.json:13-21`, `src-tauri/Cargo.toml:18-23` y
  `src-tauri/src/lib.rs:2514-2518` incorporan y registran los plugins de
  process y updater. `src-tauri/capabilities/default.json:4-11` declara sus
  permisos.
- `README.md:19-29,53-61` deja de presentar como pendientes algunos flujos ya
  implementados y menciona el catálogo curado real, Auto Skills con evidencia
  y verificación de hash.

### Sigue abierto y por qué

- Firma y notarización macOS: el workflow ya declara las variables Apple en
  `.github/workflows/release.yml:37-44`, pero no hay certificados ni secretos
  en el repositorio y no se ha ejecutado una firma/notarización desde esta
  máquina. Requiere configurar el certificado Developer ID, identidad,
  credenciales de notarización y probar un runner macOS real.
- Updater: el plugin y sus permisos están compilados, pero
  `src-tauri/tauri.conf.json` no contiene deliberadamente una clave pública ni
  endpoints ficticios. Falta generar un par minisign, configurar
  `bundle.createUpdaterArtifacts`, publicar artefactos firmados y añadir el
  endpoint estable. Sin esos datos no existe un updater operativo; solo existe
  el plumbing seguro para integrarlo.
- Landing, checkout, monetización y licencias: no hay en el árbol actual una
  aplicación web, proveedor de pagos, dominio, precios ni modelo de licencia
  que se pueda implementar sin una decisión externa. Se mantiene como bloque
  de producto/distribución, no como código inventado en la app local.
- Validación multiplataforma: este entorno sí validó el binario release con
  `pnpm exec tauri build --no-bundle`; no construyó el DMG firmado ni los
  instaladores Windows/Linux, porque requieren sus runners y, en macOS,
  credenciales reales.

## 5. Verificación después de los cambios

Todas estas comprobaciones terminaron correctamente:

- `pnpm test`: 13 tests pasados.
- `cd src-tauri && cargo test`: 41 pasados y 1 ignorado.
- `npx tsc -b`: correcto.
- `node scripts/check-locales.mjs`: 7 locales, 413 claves, interpolaciones
  coincidentes.
- `cargo fmt -- --check`: correcto.
- `pnpm build`: build web de producción correcto.
- `pnpm exec tauri build --no-bundle`: binario release Tauri generado en
  `src-tauri/target/release/skill-control`.
- `git diff --check`: correcto.

La firma/notarización, la publicación del DMG y el updater no se marcan como
hechos porque dependen de infraestructura y secretos que no están disponibles
en el repositorio local.
