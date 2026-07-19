# Discover: de catálogo falso a catálogo real — diagnóstico, decisión y cambios

Fecha: 2026-07-19 · Base sobre la que se detectó el problema: commit `103eb35` · Estado: **implementado y verificado**

Este documento existe para que cualquier persona o IA que retome este trabajo tenga el diagnóstico completo, la decisión de producto y la referencia técnica exacta de lo que se cambió — sin tener que reconstruir el análisis desde cero.

---

## 1. Resumen ejecutivo

Probando la aplicación como PM/usuario (`pnpm dev`, modo demo, navegador) se encontró que la pestaña **Descubrir** del sidebar no era una versión reducida del catálogo real, sino un flujo completamente distinto y muerto que:

1. Mostraba 3 skills inventadas (`repo-hygiene`, `web-performance`, `api-contracts`) definidas a mano en el frontend.
2. Al pulsar "Instalar", escribía en `.claude/skills` o `.agents/skills` un `SKILL.md` **fabricado en el momento** por el backend, con `source_repository: Mafia-Labs/SkillsControl` — es decir, atribuía el origen al propio repositorio de la app, no a una fuente real.
3. Convivía, sin que el usuario pudiera notarlo, con el flujo real y bueno que ya existía para Auto Skills (`install_listed_skill` contra la MafiaIA Skill List, con descarga verificada por hash SHA-256 y commit fijado).

Visualmente ambos flujos eran indistinguibles — mismo estilo de tarjeta, mismo copy de confianza ("cada entrada tiene un origen conocido"). Esto era un riesgo real de producto: cualquier usuario fuera del modo demo que instalara algo desde Descubrir habría recibido contenido de relleno con procedencia falsa, en una app cuyo diferencial es precisamente la seguridad y la procedencia verificable.

**Decisión tomada:** no retirar la pestaña, sino conectarla al mismo catálogo real y al mismo pipeline de instalación verificado que ya usa Auto Skills (`skill_list.rs` / MafiaIA Skill List, ~248 skills). Se descartó "quitar Descubrir del sidebar" porque el catálogo real ya existe y ya se descarga con verificación de hash — el trabajo que faltaba era exponerlo para navegación libre, no inventar uno nuevo.

---

## 2. Diagnóstico técnico (estado *antes* del fix)

| Pieza | Qué hacía | Evidencia |
|---|---|---|
| `src/components/Discover.tsx` | Leía `catalog` de `src/lib/demo-data.ts` (array estático de 3 entradas fake) | Import `import { catalog } from '../lib/demo-data'` |
| `src/lib/demo-data.ts` → `catalog: CatalogSkill[]` | 3 skills con `source: 'Alex Picks'`, sin relación con ningún repo real | — |
| `src-tauri/src/lib.rs` → `install_catalog_skill` (línea ~2135 en `103eb35`) | Generaba un `SKILL.md` con `format!(...)` a partir de `catalog_definition(skill_id)`, un `match` hardcodeado de 3 entradas (línea ~1667) | `source_url: https://github.com/Mafia-Labs/SkillsControl`, `source_commit: {CURATED_SOURCE_COMMIT}` (constante fija `"1d8ed03"`, sin relación con el contenido real instalado) |
| Comparar con el flujo real | `install_listed_skill` (línea ~2246) descarga el tarball de `skill.source.repo@skill.source.commit`, lo extrae, calcula `bundle_hash` y **aborta la instalación si el hash no coincide** con el pin de la lista | `src-tauri/src/skill_list.rs` |

El propio `plan-v1-lanzamiento.md` (fechado 2026-07-14) ya había señalado esto como bloqueante ("Discover es un stub con datos falsos") pero el trabajo de las últimas semanas se priorizó correctamente hacia Auto Skills y el ciclo de vida global→proyecto (ver `docs/plan-pm-ux-ciclo-de-vida-skills.md`), dejando Descubrir sin resolver. Este documento cierra ese gap.

---

## 3. Cambios implementados

### Backend (`src-tauri/src/lib.rs`)

- **Eliminado**: `catalog_definition()`, `install_catalog_skill` (comando Tauri), `write_skill_atomically()` (solo se usaba desde `install_catalog_skill`; `copy_skill_atomically`, que sí usa el flujo real, se mantiene intacta) y la constante `CURATED_SOURCE_COMMIT`.
- **Añadido**: comando `list_catalog_skills` (línea ~2099) y struct `CatalogEntry` (línea ~2090, `#[serde(rename_all = "camelCase")]`), que envuelve `skill_list::load_skill_list()` y proyecta solo lo que el frontend necesita renderizar: `id`, `name`, `description`, `techs`, `sourceRepo`. No expone `commit`/`sha256` — esos siguen viviendo solo en `skill_list::ListedSkill` y se resuelven de nuevo, server-side, en el momento de instalar (`install_listed_skill` ya hace su propio `load_skill_list()` — no hay TOCTOU entre listar e instalar porque el id es la única referencia que cruza el límite).
- Registrado en `invoke_handler!` en sustitución de `install_catalog_skill`.
- `cargo test`: 40 passed, 1 ignored (test de red, sin cambios) — sin regresiones.

### Frontend

- **`src/lib/types.ts`**: `CatalogSkill` (con `category`/`risk`/`compatibility`/`contextTokens` inventados) sustituido por `CatalogEntry`, que refleja exactamente lo que devuelve el backend.
- **`src/lib/desktop.ts`**: `installCatalogSkill` eliminado; añadido `listCatalogSkills()`, que en modo Tauri invoca `list_catalog_skills` y en modo demo (navegador sin Tauri) devuelve `demoCatalog`.
- **`src/lib/demo-data.ts`**: el `catalog` fake se sustituyó por `demoCatalog`, 4 entradas reales tomadas del `skill-list.json` ya embebido (`next-best-practices`, `react-best-practices`, `mafia-frontend-design`, `mafia-prompt-master`), con sus repos reales. Es una muestra estática solo para la demo de navegador (no se puede llamar a Tauri desde ahí); la app de escritorio real siempre pide la lista completa en vivo.
- **`src/components/Discover.tsx`**: reescrito. Ahora hace `useEffect` → `listCatalogSkills()` con estado de carga (`Loading`) y error (`Empty` + mensaje real de la excepción) en vez de asumir datos síncronos. El filtro de búsqueda ahora también mira `techs`. Cada tarjeta muestra los chips de tecnología (reutilizando `.stack-chip`, ya existente en `projects.css`) y el repo de origen en vez de un contador de tokens inventado.
- **`src/components/ChangeModal.tsx`**: eliminado el `kind: 'install'` (y el bloque JSX que solo él usaba) del tipo `ModalState`; el único flujo de instalación de catálogo que queda es `install-listed`, que ya mostraba "Origen verificado" + commit fijado + verificación de hash.
- **`src/App.tsx`**: `Discover` ahora recibe `onInstall={requestInstallFromCatalog}`, que abre el modal `install-listed` construyendo un `SkillRecommendation` mínimo a partir del `CatalogEntry` (mismo modal, misma verificación, mismo comando `installListedSkill` que ya usa Auto Skills). Se eliminó la rama de `applyModal` que llamaba a `installCatalogSkill`.
- **`src/components/shared.tsx`**: `Loading` acepta ahora un `label` opcional (antes tenía fijo el texto "leyendo carpetas locales", que no aplicaba a una carga de catálogo remoto).
- **i18n (7 locales)**: eliminadas las claves huérfanas que solo usaba el flujo falso (`app.notices.installed`, `change.installSkill`, `change.projectScopeDescription`, `common.allCompatibleAgents`, `discover.tokens`, `console.resolvingCatalog`, `console.downloadingSkill`); añadidas `discover.loadingCatalog` y `discover.loadError` en los 7 idiomas. `node scripts/check-locales.mjs` → `OK — 7 locales, 359 keys, matching interpolations`.

### Verificación realizada

- `cargo build` / `cargo test` (src-tauri): compila sin warnings nuevos, 40/41 tests (igual que antes del fix).
- `npx tsc -b`: sin errores.
- `pnpm test` (vitest): 11/11.
- `pnpm build`: build de producción sin errores.
- Prueba manual en navegador (modo demo): Descubrir muestra las 4 entradas reales con chips de tecnología y repo de origen; al pulsar "Instalar" se abre el modal con el texto **"Origen verificado · De la lista curada, fijado a un commit exacto de vercel-labs/next-skills · El contenido se descarga y su SHA-256 se verifica antes de escribir nada"** — el mismo modal que ya usaba Auto Skills, confirmado visualmente.

Diff total: 15 archivos, +118/−232 líneas (neto: se borró más código falso del que se añadió).

---

## 4. Qué queda pendiente (instrucciones técnicas para quien continúe)

Este fix resuelve el problema de confianza/producto. Quedan mejoras de calidad que **no bloquean** lo anterior pero sí conviene abordar antes de considerar Descubrir "terminado":

1. **Sin paginación ni virtualización.** `list_catalog_skills` devuelve las ~248 skills completas y `Discover.tsx` las renderiza todas si la búsqueda está vacía. Funciona pero no es la mejor primera impresión. Sugerencia técnica: no reordenar ni cachear en el backend (mantenerlo *stateless*); en el frontend, limitar el render inicial (p. ej. primeras 30 + "mostrar más" o mensaje invitando a buscar) usando el mismo array ya cargado — no hace falta tocar Rust.
2. **Sin test automatizado del comando ni del componente.** No hay test Rust para `list_catalog_skills` (trivial: reutilizar el fixture de `skill_list::tests::bundled_list_parses_and_validates`) ni test de Vitest para `Discover.tsx` (mockear `listCatalogSkills`, cubrir estados: cargando, error, vacío por búsqueda, filtro por `techs`).
3. **Sin caché ni offline-first en el frontend.** `list_catalog_skills` hace red en cada visita a la pestaña (aunque `skill_list::load_skill_list()` ya cae al bundle local si la red falla — ver `src-tauri/src/skill_list.rs:103-122` —, así que nunca se rompe, solo tarda). Si se detecta que pesa en UX, cachear en memoria de React (un `useState` a nivel de `App.tsx` en vez de `Discover.tsx`, para no re-pedir al cambiar de pestaña) es suficiente; no hace falta IndexedDB ni backend nuevo.
4. **Copy de "Small, reviewed skill packs" (`discover.title` / `discover.description`) no se tocó.** Con 248 entradas navegables por búsqueda, sigue siendo defendible ("packs pequeños y revisados" describe cada entrada individual, no el tamaño del catálogo), pero si se añade paginación (punto 1) vale la pena revisar el copy en los 7 idiomas a la vez para que hable de "busca en la lista curada" en vez de dar a entender que son solo unas pocas.
5. **Licencia de contenido `midudev/autoskills` (CC BY-NC).** Ya señalado en `docs/plan-v1-lanzamiento.md` §3 "Riesgos a vigilar": este fix no cambia esa exposición (el catálogo ya se servía igual desde Auto Skills), pero ahora Descubrir también lo hace navegable, así que si se decide monetizar la app, este es el mismo punto a resolver antes — no uno nuevo introducido aquí.
6. **Filtros por categoría/técnología en la UI.** El backend ya expone `techs: Vec<String>` por entrada; hoy solo se usan como chips decorativos y en el `includes()` de búsqueda de texto libre. Un `<select>` de filtro por tecnología (agregando valores únicos de `techs` en el frontend) es una mejora natural de siguiente iteración, sin cambios de backend.

Nada de lo anterior es bloqueante para considerar el hallazgo original — "Descubrir instala contenido falso con procedencia falsa" — **cerrado**.

---

## 5. Checklist de aceptación de este fix

- [x] Descubrir consume el catálogo real (`skill_list::load_skill_list()`), no datos inventados.
- [x] Instalar desde Descubrir usa el mismo pipeline verificado por hash que Auto Skills (`install_listed_skill`), no un generador de `SKILL.md` falso.
- [x] Ningún comando Tauri escribe ya contenido con `source_repository` atribuido al propio repo de Skill Control.
- [x] `cargo test`, `pnpm test`, `tsc -b`, `pnpm build` y `check-locales.mjs` en verde.
- [x] Probado manualmente en el navegador (modo demo): carga, búsqueda y apertura del modal de instalación verificada.
- [ ] Paginación/virtualización, tests automatizados de este flujo, caché en frontend — ver §4, no bloqueantes.
