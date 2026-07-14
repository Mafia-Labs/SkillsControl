# Prompt para Claude Code — Auto Skills (MVP)

Pégalo tal cual en Claude Code con este repo abierto.

---

Vamos a implementar **Auto Skills**, la funcionalidad central de Skill Control. Lee este documento completo antes de tocar nada.

## 1. Contexto del proyecto

Skill Control es una app de escritorio (Tauri 2 con backend en Rust; frontend React 18 + TypeScript + Vite; tests con `cargo test` y `vitest`; gestor pnpm). Es un centro de control local para las skills de agentes IA (Claude Code en `.claude/skills`, Codex/Agent Skills en `.agents/skills`): inventario de instalaciones globales y locales, diagnóstico de salud y seguridad, comparación de copias divergentes por hash, instalación por proyecto e instalación/archivo reversible.

Decisión de producto clave que ya está tomada: el ámbito por defecto es **proyecto/carpeta, no global**. Y el público objetivo incluye a **personas no desarrolladoras**: todo debe poder hacerse desde la interfaz, sin terminal, con lenguaje claro en español.

Código existente que DEBES leer y reutilizar antes de escribir nada nuevo:

- `src-tauri/src/lib.rs` (~2600 líneas). Ya existe: `discover_projects` (recorrido de carpetas con marcadores de proyecto: `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, `.git`…), `should_skip_directory` (excluye `node_modules`, `dist`, `target`, `.next`, `.venv`, `vendor`, `coverage`…), `scan_candidate`, hashing SHA-256 (`skill_hash`, `sha256_hex`), lectura de `skills-lock.json` (`read_lock_metadata`, `lock_entry`, `lockfile_paths`), análisis de seguridad de skills (`analyze_skill`, findings), base SQLite de archivo/reputación, y una instalación transaccional multi-destino que nunca sobrescribe y revierte si falla un destino.
- `src/components/Discover.tsx`: stub de 13 líneas. Aquí va la UI nueva.
- `src/lib/desktop.ts`: wrapper de `invoke`. `src/lib/types.ts`: tipos compartidos TS. `src/lib/skill-utils.ts` + test: utilidades con patrón de test ya establecido.
- `docs/analisis-autoskills.md`: análisis técnico del proyecto de referencia. Léelo entero; es la especificación de partida.

## 2. Referencia e inspiración: autoskills (y por qué no copiarlo)

`npx autoskills` (midudev) detecta el stack de un proyecto de código y le instala skills curadas. Su diseño interno está documentado en `docs/analisis-autoskills.md`. Las ideas que adoptamos: mapa declarativo tecnología→skills con criterios de detección, combos por combinación de tecnologías, skills transversales por perfil de proyecto, y recomendaciones idempotentes que marcan lo ya instalado.

Dos restricciones al respecto:

1. **Licencia**: autoskills es CC BY-NC 4.0. No copies ni una línea de su código, ni sus textos, ni su mapa tecnología→skill tal cual. Reimplementación limpia. Aunque hoy no haya intención comercial, no queremos esa dependencia legal.
2. **Calidad**: su código fue generado con modelos de IA anteriores. No lo trates como referencia de calidad, trátalo como referencia funcional. Se espera que tu implementación sea mejor: tipada, sin panics, con separación I/O/lógica y con tests de verdad.

## 3. Qué construimos (producto)

**Historia de usuario**: "Añado una carpeta de mi proyecto a Skill Control. La app entiende qué estoy usando y me propone las skills adecuadas, explicándome por qué. Selecciono las que quiero y se instalan en mi proyecto. No necesito saber qué es un package.json."

**Flujo exacto en la pestaña Discover:**

1. Selector de proyecto: reutiliza el descubrimiento de workspace existente (proyectos y paquetes ya detectados). También debe funcionar con una carpeta recién añadida.
2. Botón primario "Analizar proyecto". Al pulsarlo se ejecuta la detección (comando Tauri, ver §4) con indicador de progreso.
3. Resultado, sección A — **Stack detectado**: chips con las tecnologías encontradas (nombre + icono si lo hay). Las tecnologías detectadas sin skills asociadas también se muestran (atenuadas, "sin skills todavía") — es información honesta y útil.
4. Resultado, sección B — **Skills recomendadas**, agrupadas por tecnología (los combos y perfiles como grupos propios, p. ej. "Next.js + Supabase", "Frontend"). Cada skill muestra:
   - nombre y descripción corta,
   - la **evidencia** en lenguaje humano: "Porque usas React (encontrado en package.json)", "Porque existe next.config.ts",
   - badge "Ya instalada" cuando proceda (cruzando con el inventario existente y con `skills-lock.json`), con la fila deshabilitada por defecto,
   - checkbox de selección; control "Seleccionar todas (N)".
5. Selector de ámbito (proyecto/global, proyecto por defecto) y cobertura de agentes (todos / Codex / Claude Code), reutilizando el patrón que ya existe en la instalación actual.
6. Botón "Instalar seleccionadas (N)" → usa la instalación transaccional existente → resumen final: instaladas, omitidas y por qué, errores si los hubo.
7. Estados vacíos obligatorios y bien escritos: (a) no se detectó nada: "No hemos reconocido tecnologías en esta carpeta" + acción alternativa; (b) todo ya instalado: mensaje positivo, no un vacío confuso.

**Principios de UX**: la razón de cada recomendación siempre visible (es lo que da confianza a un usuario no técnico), nunca instalar sin confirmación explícita, nunca sobrescribir nada, textos en español sin jerga.

## 4. Arquitectura e ingeniería

### 4.1 Mapa de detección como datos, no como código

El mapa vive en `src-tauri/detection-map.json`, embebido con `include_str!` y deserializado con serde al arrancar (con validación: si el JSON es inválido, error claro en logs y la feature se degrada con mensaje, la app no crashea). Motivo de producto: en fase futura este mapa vendrá de un directorio remoto y debe poder actualizarse sin recompilar.

Esquema por entrada (diseña los structs serde correspondientes):

```json
{
  "id": "nextjs",
  "name": "Next.js",
  "category": "framework-frontend",
  "detect": {
    "packages": ["next"],
    "package_patterns": [],
    "config_files": ["next.config.js", "next.config.mjs", "next.config.ts"],
    "file_extensions": [],
    "config_file_content": [{ "files": ["pyproject.toml"], "patterns": ["fastapi"] }]
  },
  "skills": [
    { "id": "next-best-practices", "source_repo": "vercel-labs/next-skills", "description": "Buenas prácticas de Next.js" }
  ]
}
```

Además del array de tecnologías, el JSON incluye: `combos` (`{ id, name, requires: ["nextjs","supabase"], skills: [...] }`), `profiles` (por ahora solo `frontend`: se activa si cualquier tecnología con `category` frontend está detectada o si hay archivos `.tsx/.jsx/.vue/.svelte/.html/.css` en el árbol, y aporta skills transversales de accesibilidad, diseño frontend y SEO) y `version` del esquema.

Pobla el mapa con **~25 tecnologías reales** usando skills públicas de repos oficiales (Anthropic, Vercel, Cloudflare, Expo, Supabase, Astro, Svelte, Angular, Prisma, Stripe, Playwright, Tailwind, shadcn, TypeScript, Node, Python/FastAPI/Django, Go, Rust, Tauri…). Los IDs de skill y repos deben ser reales (formato `owner/repo/skill` de skills.sh); las descripciones escríbelas tú en español.

### 4.2 Motor de detección (módulo Rust nuevo, p. ej. `src-tauri/src/detection.rs`)

Separación estricta: funciones puras que reciben datos ya leídos (contenido de package.json parseado, listas de archivos) y una capa fina de I/O que las alimenta. Todo lo puro, testeado sin filesystem.

Algoritmo:

1. Lee `package.json` de la raíz: `dependencies` + `devDependencies`. JSON malformado ⇒ se ignora con warning, jamás panic.
2. Monorepos: si hay `pnpm-workspace.yaml` (parsea la lista `packages:` con tolerancia) o campo `workspaces` en package.json, expande los globs sencillos (`packages/*`), ejecuta la detección en cada workspace y deduplica tecnologías por `id`.
3. Por cada tecnología evalúa criterios en cascada y corta al primer match, registrando la **evidencia** estructurada (enum: `PackageDependency { name }`, `ConfigFilePresent { path }`, `FileExtensionFound { ext, example_path }`, `ContentMatch { file, pattern }`) — la UI la convierte en texto legible.
4. Escaneo por extensiones: profundidad máx. 4, reutiliza `should_skip_directory`, no sigue symlinks, y cachea el resultado por conjunto de extensiones dentro de la ejecución (varias tecnologías comparten escaneo).
5. Tras la pasada individual: evalúa `combos` sobre el set de ids detectados y el perfil frontend.
6. Cruza con lo instalado: inventario existente + `skills-lock.json` (las funciones de lectura ya existen en lib.rs) para marcar `installed: true`.

Salida — comando Tauri `detect_stack(project_path: String) -> Result<DetectionReport, DetectionError>`:

```
DetectionReport {
  detected: [ { tech_id, tech_name, category, evidence: [...], has_skills } ],
  recommendations: [ { skill_id, source_repo, description, reasons: [{ tech_name, evidence_text }], installed } ],
  groups: [ { label, kind: technology|combo|profile, skill_ids } ],
  scanned_workspaces: [paths],
  duration_ms
}
```

Tipos espejo en `src/lib/types.ts` y wrapper en `src/lib/desktop.ts` siguiendo el patrón existente.

### 4.3 Calidad exigida

- Errores tipados (enum propio o `thiserror`), nada de `String` como error ni `unwrap()`/`expect()` sobre input externo o filesystem.
- Path traversal: valida que `project_path` está dentro de los workspace roots registrados, igual que hacen los comandos existentes (`validate_installation` como referencia).
- Rendimiento razonable: la detección de un monorepo mediano debe ir por debajo del segundo; usa los caches descritos, no leas el mismo archivo dos veces.
- `cargo clippy` sin warnings nuevos, código y comentarios en el estilo del archivo existente.

### 4.4 Tests obligatorios

Rust (`#[cfg(test)]` con tempdir, sin tocar el filesystem real del usuario), fixtures mínimos:
1. App Next.js: package.json con `next` + `next.config.ts` ⇒ detecta nextjs, react si está, typescript; evidencia correcta.
2. Monorepo pnpm con dos workspaces con stacks distintos ⇒ unión deduplicada.
3. Proyecto sin package.json pero con config files (p. ej. `pyproject.toml` con `fastapi`) ⇒ detección por contenido.
4. Carpeta vacía ⇒ reporte vacío válido, sin error.
5. package.json malformado ⇒ no panic, warning, resto de criterios sigue funcionando.
6. Combo: nextjs + supabase presentes ⇒ grupo combo aparece; solo uno ⇒ no aparece.
7. Skill ya instalada en `.claude/skills` ⇒ `installed: true`.

Vitest: agrupado de recomendaciones, filtrado/deshabilitado de instaladas, lógica de selección (seleccionar todas excluye instaladas), render de evidencia a texto.

## 5. Fuera de alcance del MVP

No implementes (pero no cierres puertas en el diseño): registry remoto con verificación de hashes y manifiesto, escritura de `skills-lock.json` al instalar, revisión automatizada de skills con LLM, detección de carpetas no-código (documentos, finanzas, diseño — vendrá después sobre este mismo motor vía `file_extensions` y categorías nuevas), symlinks canónicos multi-agente, y actualización del mapa desde red.

## 6. Cómo trabajar

1. **Explora**: lee los archivos del §1 y `docs/analisis-autoskills.md`. Resume en ~10 líneas qué funciones existentes vas a reutilizar y dónde encaja cada pieza nueva.
2. **Planifica**: proponme el plan (módulos, structs serde, firma del comando, componentes React, orden de commits) y **espera mi OK antes de escribir código**. Si algo de este documento contradice la realidad del repo, el código manda: adapta el plan y dímelo.
3. **Implementa** en pasos que compilan y pasan tests: (a) esquema + carga del mapa, (b) motor puro + tests, (c) comando Tauri + tipos TS, (d) UI Discover, (e) integración con instalación existente, (f) mapa poblado. Un commit por paso con mensaje descriptivo.
4. **Verifica**: `cargo test`, `cargo clippy`, `pnpm test` en verde; descríbeme la prueba manual del flujo completo paso a paso.
5. **Cierra** con: resumen de arquitectura (10-15 líneas), decisiones tomadas y por qué, y deuda técnica consciente.

Reglas que mandan sobre todo lo demás: cero código copiado de autoskills, mapa como datos y no como lógica, 100% offline, nunca sobrescribir skills existentes, ningún panic ante input del usuario. Empieza por el paso 1 y párate tras el paso 2.
