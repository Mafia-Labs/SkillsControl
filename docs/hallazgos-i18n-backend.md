# i18n incompleto: el contenido generado por el backend no se traduce

Fecha: 2026-07-19 · Estado: **detectado, sin implementar** (no bloquea el fix de Discover, es un hallazgo aparte de la misma sesión de pruebas PM/UX)

## Hallazgo

Probando la app cambiando el idioma a español (selector de `TopBar`), las pantallas **Salud** y **Auto Skills** (panel de análisis dentro de un proyecto) muestran texto en inglés sin importar el idioma elegido, mientras que el resto de la interfaz (botones, menús, labels) sí está traducido a los 7 idiomas soportados.

Causa: ese texto no sale de `src/locales/*/translation.json` sino que se genera en Rust como `String` fijo, y el frontend lo muestra tal cual.

### Hallazgos de seguridad (`Health.tsx` / pestaña Salud)

Los títulos de los `Finding` vienen hardcodeados en inglés en `src-tauri/src/lib.rs`:

- `"Incomplete frontmatter"` — línea 1208
- `"Missing description"` — línea 1221
- `"Folder and skill name differ"` — línea 1231
- `"Large activation footprint"` — línea 1240
- `"Executable scripts detected"` — línea 1250
- `"Copies have diverged"` — línea 1782
- `"Global and project copies"` — línea 1802

(y sus `detail` correspondientes, en el mismo bloque de cada uno).

### Razones y descripciones de Auto Skills (`ProjectDetail.tsx` → `AnalysisPanel`)

En `src-tauri/src/detection.rs`, la función `evidence_text()` (línea 974) construye el texto de "por qué se recomienda" (`recommendation.reasons[].evidenceText`) en inglés fijo, y la combinación de tecnologías en la línea 803 (`format!("Detected the combination of {}.", ...)`). Las descripciones de cada skill recomendada (`recommendation.description`) salen de `detection-map.json`, que también está en inglés.

## Por qué importa

Salud y Auto Skills son, junto con Descubrir (ver [fix-discover-catalogo-real.md](fix-discover-catalogo-real.md)), las dos pantallas que más venden la confianza del producto — precisamente las que muestran texto en inglés a un usuario que eligió japonés, alemán, francés, chino o portugués. Es inconsistente con el resto de la app, que sí invirtió en traducir 7 idiomas completos (ver historial reciente: `56d7b31`, `c11e7dc`, `aac2448`, `e08b16b`, `c04e184`, `3a80d0c`).

## Qué hace falta (instrucciones técnicas)

No es tan simple como envolver los strings en `t(...)` porque **el que genera el texto es Rust, no React** — el backend no tiene acceso al idioma activo del usuario ni a i18next.

Dos caminos razonables, sin necesidad de duplicar todo el motor de detección/salud en TypeScript:

1. **Backend emite claves + parámetros, frontend traduce.** Cambiar `Finding.title`/`Finding.detail` y `RecommendationReason.evidenceText` de `String` a algo como `{ key: string, params: HashMap<String, String> }` (o una clave fija más los datos crudos: nombre de archivo, nombre de tecnología, conteo). El frontend añade esas claves a `src/locales/*/translation.json` (7 idiomas) y las resuelve con `t(finding.titleKey, finding.params)`, igual que ya hace el resto de la UI. Es el enfoque más consistente con el patrón ya usado en `ProjectDetail.tsx` (`i18n.t('projectDetail.recommendationsReady', { count, ... })`).
2. **Backend recibe el idioma activo y devuelve texto ya traducido.** Pasar `locale` como parámetro a `scan_skills`/`detect_stack` y mantener un mapa de plantillas en Rust por idioma. Requiere mantener traducciones en dos sitios (Rust y JSON) en vez de uno — más trabajo de mantenimiento a largo plazo. No recomendado salvo que haya una razón concreta para no tocar el contrato de tipos actual.

**Recomendación: opción 1.** Encaja mejor con la arquitectura ya existente (i18next en frontend, backend como motor puro de datos) y no duplica diccionarios.

## Alcance de la corrección

- `src-tauri/src/lib.rs`: cada sitio que construye un `Finding` (buscar `title:` en el archivo) pasa a emitir clave + params.
- `src-tauri/src/detection.rs`: `evidence_text()` y el `format!` de combos (línea 803) devuelven clave + params en vez de `String` final.
- `src/lib/types.ts`: `Finding` y `RecommendationReason` cambian de forma.
- `src/components/Health.tsx`, `src/components/ProjectDetail.tsx` (`AnalysisPanel`): usan `t(finding.titleKey, finding.params)` en vez de `finding.title` directo.
- 7 archivos de locale: nuevas claves para cada tipo de finding/razón (con sus placeholders, ej. `{{path}}`, `{{techName}}`).
- Tests: `src-tauri` ya tiene tests que hacen `assert!(finding.title == "...")` (ver `tests::detects_dangerous_commands_credentials_and_invoked_non_executable_scripts` y similares) — deben actualizarse para comparar contra la clave en vez del texto en inglés.
- `node scripts/check-locales.mjs` debe seguir en verde al terminar.

No es un cambio trivial (toca el contrato entre backend y frontend en dos motores distintos), pero es acotable: no requiere retocar la lógica de detección/seguridad en sí, solo cómo se comunica su resultado.
