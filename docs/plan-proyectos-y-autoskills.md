# Plan: skills locales por proyecto + Auto Skills

Fecha: 2026-07-13 · Revisado: 2026-07-14 tras los commits `1342100` y `a545051` · Autor del análisis: auditoría de código completa de `src-tauri/src/lib.rs`, `src/App.tsx`, `desktop.ts`, `SkillMap.tsx`, `Overview.tsx`, `Discover.tsx`, `types.ts`, `demo-data.ts`, `detection.rs`.

> **Revisión 2026-07-14.** Dos commits nuevos implementan el motor de detección de Auto Skills (`detection.rs`, 1.272 líneas, 12 tests, con evidencia estructurada, soporte de monorepos pnpm y separación I/O/lógica — fases a y b del prompt MVP, con calidad alineada a la spec). Además existe `docs/plan-v1-lanzamiento.md`, que cubre el camino a v1 incluyendo release y monetización. **Este documento pasa a ser una enmienda a ese plan, no un plan competidor.** Lo que sigue vigente y lo que cambia:
>
> - **Sigue vigente al 100%**: el problema origen de este documento. Ningún commit toca la visibilidad de skills instaladas por proyecto, y el plan v1 tampoco la contempla — su Fase 1 cablea Auto Skills en Discover pero no crea inventario por proyecto. La Fase 1 de este documento (vista de Proyectos) debe insertarse en el plan v1.
> - **Cambia**: Auto Skills ya no está "no integrado en absoluto"; el motor existe pero está muerto en el binario (sin comando `detect_stack` ni UI), como el propio plan v1 reconoce. La Fase 2 de este documento queda reducida a: comando Tauri + UI, con la UI en el **detalle de proyecto** (recomendación de este documento) en lugar de en Discover (como dice el plan v1). Decisión a tomar; argumentos en §3 Fase 2.
> - **Corrección de dato al plan v1**: afirma que `detection-map.json` tiene ~25 tecnologías. Tiene **4** (nextjs, react, typescript, supabase) + 1 combo + perfil frontend. Es un seed; poblarlo es tarea pendiente real de su Fase 1.

## 1. Diagnóstico: dónde está el problema exactamente

**El backend SÍ escanea las skills locales, y lo hace bien.** `scan_skills` recorre los workspace roots hasta profundidad 32, descubre proyectos por marcadores (`.git`, `package.json`, `Cargo.toml`…) o por tener `.agents/skills`/`.claude/skills`, conserva la carpeta raíz aunque no tenga marcadores, y devuelve cada instalación con su `scope: "project"` y su `projectPath`. El `ScanReport` incluye la lista de `projects` con sus agentes. Los datos existen y llegan al frontend.

**El frontend NO los enseña. Ahí está el agujero.** Tres fallos concretos:

1. **No existe ninguna vista por proyecto.** La UI es skill-céntrica: SkillMap es una matriz skill × agente donde una instalación local se reduce a un punto verde con tooltip "Installed in N project scopes" — sin decir *cuáles*. Overview solo muestra el contador "Project scopes". `report.projects` únicamente se usa como desplegable de destino al instalar. Es imposible responder la pregunta más básica del producto: **"¿qué skills tiene mi proyecto X?"**. Este es el síntoma que estás viendo.
2. **Discover es 100% demo.** El "catálogo curado" son 3 skills inventadas hardcodeadas en `demo-data.ts` ("Alex Picks"), e `install_catalog_skill` genera el SKILL.md desde strings incrustados en `lib.rs`. Auto Skills (detectar stack → recomendar) no está integrado en absoluto: no hay detección, no hay mapa tecnología→skills, no hay recomendaciones. Lo que hay es un placeholder visual.
3. **Fallback demo silencioso.** Si la app corre sin Tauri (`pnpm dev` en navegador), `scanSkills` devuelve `demoReport` sin ningún aviso. Cualquiera que pruebe en ese modo ve datos falsos creyendo que son reales. Y en la app de escritorio, los workspace roots viven solo en `localStorage` del frontend: no hay UI para ver qué carpetas están añadidas ni para quitarlas, y se pierden si se limpia el almacenamiento del webview.

Menores pero relevantes para el público objetivo: toda la UI está en inglés (el producto apunta a hispanohablantes no técnicos) y la búsqueda no filtra por proyecto.

**Conclusión**: no es un bug de escaneo, es un hueco de producto. El modelo de datos ya es proyecto-céntrico; la interfaz todavía no.

## 2. Principio de producto

**El proyecto (carpeta/repo) es la entidad de primer nivel de la app, no la skill.** La decisión de producto ya tomada — "el ámbito por defecto es proyecto, no global" — tiene que reflejarse en la navegación. El usuario piensa "mi proyecto de la newsletter", "mi repo de la web", no "mi skill de tailwind". Y Auto Skills refuerza esto: la detección, la recomendación y la instalación ocurren *sobre un proyecto*. Todo converge en una misma pantalla.

## 3. Plan por fases

### Fase 1 — Vista de Proyectos (arregla el síntoma actual)

Nueva vista "Proyectos" en la barra lateral, primera de la lista y vista inicial de la app.

**Pantalla lista de proyectos.** Una tarjeta por proyecto detectado (`report.projects` + instalaciones cruzadas por `projectPath`):

- Nombre, ruta abreviada, agentes activos (Codex / Claude Code) como badges.
- "N skills instaladas" con las 3-4 primeras como chips y estado de salud agregado (heredando `getSkillHealth` que ya existe).
- Estado vacío por proyecto: "Este proyecto no tiene skills todavía" + CTA "Analizar y recomendar" (gancho de Fase 2).
- Cabecera de la vista: gestión de carpetas del workspace — chips de cada root añadido con botón de quitar, y "Añadir carpeta". Hoy añadir existe pero es invisible; quitar no existe.

**Pantalla detalle de proyecto** (al pulsar una tarjeta):

- Tabla de skills instaladas en ese proyecto: nombre, agente(s), ruta local (`.claude/skills/...` o `.agents/skills/...`), salud, hash divergente respecto a otras copias si aplica (dato que el backend ya calcula).
- Acciones por fila reutilizando lo existente: inspeccionar (abre Inspector), poner en cuarentena/archivar, confiar en versión.
- Sección "Copias globales que también aplican aquí": skills instaladas en `~/.claude/skills` / `~/.agents/skills` que los agentes verían al trabajar en este proyecto, con la acción ya existente "convertir en local".

**Cambios de ingeniería (frontend casi todo; el backend ya lo da):**

- `skill-utils.ts`: `groupInstallationsByProject(report): ProjectInventory[]` — pura, testeada con vitest.
- `Projects.tsx` + `ProjectDetail.tsx`; ruta nueva en `App.tsx` (`view: 'projects'`); TopBar: el buscador filtra también por proyecto.
- Persistencia de roots en backend: comando Tauri `get_workspace_roots` / `set_workspace_roots` guardando en el directorio de datos de la app (junto a la SQLite existente), con migración desde `localStorage` al primer arranque. Elimina la fragilidad actual.
- Banner permanente "Modo demostración — datos de ejemplo" cuando `!isTauri()`, y `demoReport` enriquecido con 2-3 proyectos de ejemplo para que la demo enseñe la vista nueva.

**Hecho cuando**: con dos carpetas añadidas que contienen `.claude/skills` o `.agents/skills`, la vista Proyectos muestra cada proyecto con sus skills locales correctas, se puede quitar una carpeta y el reporte se actualiza, y los roots sobreviven a reiniciar la app.

### Fase 2 — Auto Skills integrado en el proyecto (la funcionalidad central)

*(Revisado 2026-07-14: el motor ya existe en `detection.rs`; esta fase queda reducida a cablearlo — comando Tauri `detect_stack` + tipos TS + UI — y a poblar `detection-map.json` de 4 a ~25 tecnologías.)*

Lo importante que queda por decidir es **dónde vive en la UI**. El plan v1 dice Discover; este documento recomienda **dentro del detalle de proyecto**, que tras la Fase 1 es el lugar natural. Argumentos: (a) el usuario piensa por proyecto, no por catálogo; (b) "qué tengo" y "qué me falta" en la misma pantalla es la propuesta de valor completa; (c) Discover queda libre para su rol de Fase 3 (directorio por categorías), sin mezclar dos conceptos distintos — recomendación contextual vs. exploración de catálogo:

- Botón primario "Analizar proyecto" en la cabecera del detalle.
- Resultado en la misma pantalla: chips de stack detectado + sección "Recomendadas para este proyecto" con la evidencia visible ("porque usas React — encontrado en package.json"), badge en las ya instaladas, multiselección e instalación con el flujo transaccional existente.
- La lista de proyectos muestra un indicador "M recomendaciones" tras analizar, para invitar a volver.
- Análisis cacheado por proyecto con timestamp ("Analizado hace 2 días — Reanalizar").

Así la pantalla de proyecto responde las dos preguntas del producto juntas: *qué tengo* (Fase 1) y *qué me falta* (Fase 2).

**Hecho cuando**: en un proyecto Next.js real, "Analizar" muestra el stack y recomendaciones correctas con razones, e instalar dos skills seleccionadas las deja visibles en la tabla de instaladas sin re-escanear manualmente.

### Fase 3 — Discover real (sustituir el placeholder)

Discover deja de ser el catálogo demo y pasa a ser el **directorio curado por categorías** (ver `docs/analisis-autoskills.md` §directorio): categorías por rol (desarrollo por stack, escritura, finanzas, legal, productividad…), fichas con procedencia y revisión, e instalación con el mismo flujo. El mapa de detección de Fase 2 se mueve del binario al directorio para actualizarse sin publicar app. `install_catalog_skill` y `catalog_definition` (skills como strings en `lib.rs`) se eliminan en favor del formato registry con hashes.

**Hecho cuando**: Discover muestra skills reales desde el registry, cada una instala contenido verificado por hash, y no queda ninguna skill hardcodeada en Rust.

### Transversal (durante las tres fases)

Textos de la UI en español claro (el hero, los empty states y los banners primero), y un pase de accesibilidad básica en las vistas nuevas (roles ARIA como ya hace SkillMap, foco visible, contraste).

## 4. Orden y dependencias

Fase 1 no depende de nada y arregla el problema visible hoy: es la primera. Fase 2 depende de Fase 1 (la UI de recomendación vive en el detalle de proyecto) y del prompt MVP ya escrito — actualiza su §3 (flujo UX) para apuntar al detalle de proyecto en lugar de a Discover. Fase 3 es independiente de la 2 en código pero comparte el formato de registry: hazla última para no diseñar el formato dos veces.

## 5. Riesgos y decisiones abiertas

- **Rendimiento del escaneo** con roots grandes (depth 32 es generoso): si la Fase 1 expone más el escaneo, medir y considerar profundidad configurable + indicador de progreso por root.
- **Proyectos anidados** (repo dentro de workspace): el backend ya los deduplica por ruta; la UI debe mostrar jerarquía plana con ruta completa para no confundir.
- **Un solo origen de verdad para "instalada"**: hoy inventario y futuro `skills-lock.json` pueden divergir; la Fase 2 debe definir el inventario físico como verdad y el lockfile como metadato de procedencia.
- **Demo mode**: decidir si el build web público se mantiene como demo comercial (entonces cuidarlo) o se elimina (entonces simplificar `desktop.ts`).
