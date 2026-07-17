# Plan: recomendaciones instalables + cobertura multi-agente

Fecha: 2026-07-17 · Origen: revisión crítica de producto sobre `feat/projects-and-auto-skills`

> **Revisión 2026-07-17 (misma fecha, decisión de producto).** Las recomendaciones no salen de un mapa genérico: salen de **una lista personal curada por Alex**, donde cada entrada apunta a su fuente real (repo/commit/hash o id de skills.sh). Además se añade una conexión opcional a un **marketplace** (skills.sh, que expone API pública en `https://skills.sh/api/v1/`) para buscar y añadir skills a esa lista. La Fase A queda redefinida abajo; el resto del diagnóstico sigue vigente.

## 1. Diagnóstico

### Por qué no se pueden instalar las recomendaciones

Dos causas, una de código y una de datos:

1. **El botón está deshabilitado a propósito.** En `ProjectDetail.tsx` (AnalysisPanel) el botón Install de cada recomendación lleva `disabled` con el tooltip "Installing from the verified directory arrives in Phase 3". No hay ningún flujo de instalación cableado para recomendaciones; el único instalador real es `install_catalog_skill`, que solo conoce las 3 skills demo hardcodeadas en `lib.rs`.

2. **La mayoría de las fuentes recomendadas no existen.** Verificado contra la API de GitHub (2026-07-17): de los 23 `source_repo` de `detection-map.json`, **16 devuelven 404** (`vuejs/skills`, `sveltejs/skills`, `remix-run/skills`, `rust-lang/skills`, `golang/skills`, `tailwindlabs/skills`, `expressjs/skills`, `tiangolo/skills`, `django/skills`, `rails/skills`, `supabase/skills`, `mongodb/skills`, `graphql/skills`, `jestjs/skills`, `vitest-dev/skills`, `tauri-apps/skills`). Y en los 7 repos que sí existen, los `skill id` referenciados tampoco coinciden con skills reales (p. ej. `angular/skills` contiene `angular-developer`, no `angular-best-practices`; `anthropics/skills` no contiene `python-best-practices`). El mapa es un seed plausible pero **no instalable**: aunque se habilitara el botón, la instalación fallaría en casi todos los casos.

### Lo que ya está bien (y hay que reutilizar, no rehacer)

- El motor de detección (`detection.rs`) funciona y da evidencia estructurada.
- La maquinaria de instalación es sólida: `write_skill_atomically`, `copy_skill_atomically`, instalación transaccional multi-destino con rollback, validación de destinos bajo `.agents/skills` / `.claude/skills`, nunca sobrescribe.
- El selector ámbito (proyecto/global) × cobertura (todos / Codex / Claude) ya existe en `ChangeModal`.
- La cobertura actual ya incluye GPT/Codex: `.agents/skills` es la ruta del estándar Agent Skills que usan Codex y los agentes que lo adoptan; `.claude/skills` cubre Claude Code.

**Conclusión:** no falta un instalador, falta (a) una fuente de contenido real y verificada para cada recomendación y (b) cablear el botón al flujo existente.

## 2. Principio de producto

**Nunca mostrar una acción que no puede cumplirse ni recomendar contenido que no existe.** Cada recomendación visible debe ser instalable en el momento en que se muestra, con procedencia verificable (repo + commit + hash). Es la misma vara que ya aplica el resto de la app (operaciones reversibles, hashes, no sobrescribir).

## 3. Plan por fases

### Fase A — Mi lista: curación personal como fuente única de recomendaciones (prioridad 1)

**Modelo:** Auto Skills solo recomienda skills que Alex ha seleccionado a mano. El `detection-map.json` deja de llevar skills incrustadas: mapea tecnología → ids de "Mi lista". Si una tecnología detectada no tiene skill en la lista, se muestra el chip de stack y un enlace "buscar en el marketplace", nunca una recomendación inventada.

1. **`my-skills.json` (la lista personal).** Cada entrada: `id`, `source` (`owner/repo` + `skill_path` **o** id de skills.sh), `commit` fijado, `sha256` del contenido, `techs` (tecnologías a las que aplica), y nota personal de por qué está en la lista. Vive en un repo de Alex (p. ej. `Mafia-Labs/skills-list`) y la app la carga con fallback embebido — se cura sin publicar app. Arranque: semilla con las fuentes verificadas hoy (`anthropics/skills`, `vercel-labs/skills`, `vercel-labs/next-skills`, `angular/skills`, `withastro/skills`, `prisma/skills`, `microsoft/skills`).
2. **Comando `install_listed_skill(entry_id, scope, target, project_path)`.** Descarga el tarball del repo en el commit fijado (codeload de GitHub), extrae la carpeta de la skill, verifica el `sha256`, e instala con `copy_skill_atomically` reutilizando la transaccionalidad multi-agente de `install_catalog_skill`. Sin commit/hash verificado, no instala.
3. **Procedencia persistente.** Al instalar, escribir/actualizar la entrada en el `skills-lock.json` local del proyecto (origen, ruta, commit, hash) — el escáner ya sabe leerlo; ahora también lo escribe.
4. **UI.** Habilitar el botón Install → abre el `ChangeModal` existente con ámbito preseleccionado al proyecto actual y cobertura "todos los agentes" por defecto. Tras instalar: `refresh()` + re-marcar `installed` en el análisis sin re-analizar a mano.
5. **Red sin conexión / fallo de descarga:** error claro y accionable ("no se pudo descargar X desde Y; reintentar"), nunca instalación parcial.

**Hecho cuando:** en un proyecto Next.js real, "Analizar" muestra solo recomendaciones que están en Mi lista, e instalar una la deja en `.claude/skills` **y** `.agents/skills` del proyecto, visible en la tabla de instaladas, con entrada en el lockfile y hash coincidente.

### Fase A1 — El repo de la lista: `MafiaIA Skill List`

La lista vive en un repo público de GitHub (p. ej. `MafiaIA/skill-list`). No es solo almacenamiento: es el pipeline que impide que la lista degenere en punteros rotos (el fallo original del detection-map).

```
skill-list/
├── list.json                ← manifiesto que consume la app
├── schema.json              ← JSON Schema del formato
├── scripts/add-skill.mjs    ← alta: resuelve commit HEAD + calcula sha256
├── .github/workflows/validate.yml
└── README.md                ← tabla legible autogenerada desde list.json
```

- **Alta con script, no a mano:** `add-skill owner/repo/path` resuelve commit, descarga, calcula sha256 y añade la entrada; Alex solo decide qué entra y escribe la nota.
- **CI en cada push/PR:** re-descarga cada entrada en su commit fijado, verifica hash, `SKILL.md` con front-matter válido y sin ids duplicados. Cron semanal que avisa de commits nuevos upstream.
- **Distribución:** la app hace fetch del raw (opcional jsDelivr como CDN) con fallback embebido. Publicar lista = merge.
- **Extras:** README autogenerado como activo público con marca; múltiples listas por vertical = más archivos con el mismo schema.

**Hecho cuando:** la app consume `list.json` remoto, la CI del repo falla si cualquier entrada deja de ser instalable, y añadir una skill nueva es un comando + merge sin tocar la app.

### Fase A2 — Marketplace conectable (skills.sh)

skills.sh es el directorio de Agent Skills de Vercel: indexa repos de GitHub con skills, tiene leaderboard de instalaciones, y su CLI (`npx skills add owner/repo`) instala en ~70 agentes. Lo relevante para Skill Control es su **API pública** (`https://skills.sh/api/v1/`):

- `GET /skills` — leaderboard paginado (all-time / trending / hot).
- `GET /skills/search` — búsqueda semántica/fuzzy por nombre y descripción.
- `GET /skills/curated` — skills first-party de los fabricantes de cada tecnología.
- `GET /skills/{source}/{skill}` — detalle **con contenido de archivos**.
- `GET /skills/audit/{source}/{skill}` — resultados de auditoría de seguridad de partners.

Integración (Discover renace como "Marketplace"):

6. **Búsqueda y ficha.** Vista Marketplace que consume search/curated/leaderboard; la ficha muestra descripción, fuente (repo GitHub), instalaciones y el resultado de `audit` — encaja con la capa de confianza que ya tiene la app (hashes, reputación).
7. **"Añadir a Mi lista"** es la acción primaria (curación personal: nada entra en recomendaciones sin pasar por Alex): resuelve el repo origen, fija commit y hash en ese momento, y pide etiquetar tecnologías. **"Instalar ahora"** como acción secundaria usa el mismo `install_listed_skill`.
8. **Verificación independiente:** aunque el detalle de la API devuelve contenido, instalar siempre desde el repo origen en el commit fijado (mismo camino que Fase A), de modo que el marketplace sea descubrimiento, no fuente de contenido. Registry adicional en el futuro = otro adaptador de búsqueda, mismo flujo.

**Hecho cuando:** buscar "supabase" en Marketplace muestra resultados reales de skills.sh con su auditoría, "Añadir a Mi lista" fija commit+hash y la skill aparece recomendada en proyectos que usan Supabase, e instalarla funciona por el flujo de Fase A.

### Fase B — Cobertura multi-agente ("el máximo de IAs posible")

6. **Hacer extensible la tabla de agentes** (hoy una const de 2 entradas en `lib.rs`). La realidad del ecosistema: `.agents/skills` ya cubre GPT/Codex y todo agente que adopte el estándar Agent Skills; el trabajo real es verificar e incorporar los que usan convenciones propias (Cursor, Gemini CLI, opencode, Copilot). Regla: añadir un agente solo tras verificar qué ruta lee de verdad su versión actual — no inventar rutas, que es exactamente el error del detection-map.
7. **UI de cobertura dinámica:** el selector "todos / Codex / Claude" pasa a construirse desde la tabla de agentes.

**Hecho cuando:** instalar con "todos los agentes" crea las copias en todas las rutas de agentes soportadas y cada agente detecta la skill al trabajar en el proyecto.

### Fase C — Redondear (claridad, no más features)

8. **Persistir análisis** en la SQLite existente con timestamp ("Analizado hace 2 días — Reanalizar"). Hoy se pierde al cerrar la app.
9. **Una sola superficie de adquisición.** Discover se convierte en Marketplace (Fase A2); eliminar `catalog_definition` y las skills-string de `lib.rs` cuando exista el instalador real. Dos superficies con roles claros: Marketplace = explorar y curar; detalle de proyecto = recomendar e instalar.
10. **Lista y mapa fuera del binario:** `my-skills.json` y el mapa de detección se sirven desde el repo con fallback embebido, para curar sin publicar app. Mi lista curada pasa a ser el activo principal del producto.
11. **"Update disponible":** comparar hash local contra el commit fijado del origen (reutiliza `check_online_reputation`) y ofrecer reinstalar.
12. **Consistencia de idioma** (decisión tomada: inglés en UI) y repaso de empty states — primera ejecución sin carpetas debe llevar de la mano a "añadir carpeta → analizar → instalar".

## 4. Orden

A es bloqueante y es la brecha visible hoy (con la lista sembrada a mano ya se puede instalar). A2 depende de A (mismo instalador; el marketplace solo alimenta la lista). B reutiliza el instalador de A. C.8 y C.9 pueden ir en paralelo con A2/B; C.10–C.11 después.

## 5. Riesgos

- **Curación es trabajo continuo**, no una tarea única: los repos upstream cambian. C.10 (lista remota) + C.11 (update disponible) lo mitigan.
- **Dependencia de skills.sh:** su API es de Vercel y puede cambiar o requerir auth (hoy documenta OIDC para apps en Vercel y rate limits). Mitigación: el marketplace es solo descubrimiento — si desaparece, Mi lista y la instalación siguen funcionando.
- **Rate limit de GitHub sin token** para descargas/verificaciones: usar codeload (no cuenta como API) y cachear.
- **Licencias:** al copiar skills de terceros al proyecto del usuario, conservar LICENSE/atribución si el repo origen la tiene.
