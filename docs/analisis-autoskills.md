# Análisis de autoskills → qué integrar en Skill Control

Fecha: 2026-07-13 · Fuentes: autoskills.sh, repo `midudev/autoskills`, paquete npm `autoskills@0.3.6` (código desensamblado del tarball) y estado actual de Skill Control (`src-tauri/src/lib.rs`, README).

## Cómo funciona autoskills por dentro

El CLI hace cuatro cosas: detecta el stack, mapea tecnologías a skills, verifica contra un registry curado e instala con lockfile. Todo el valor está en cómo resuelve cada pieza.

### 1. Detección declarativa (la pieza clave)

No hay lógica ad-hoc por tecnología. Hay un único `SKILLS_MAP`: un array de ~90 entradas donde cada tecnología declara sus criterios de detección y sus skills asociadas:

```js
{
  id: "nextjs",
  name: "Next.js",
  detect: {
    packages: ["next"],
    configFiles: ["next.config.js", "next.config.mjs", "next.config.ts"],
  },
  skills: ["vercel-labs/next-skills/next-best-practices", ...]
}
```

Los criterios soportados, en orden de evaluación (corta al primer match):

| Criterio | Qué mira | Ejemplo |
| --- | --- | --- |
| `packages` | deps + devDeps de `package.json` (y `deno.json` con imports `npm:`/`jsr:`) | `react` |
| `packagePatterns` | regex sobre nombres de paquete | `@cloudflare/*` |
| `configFiles` | existencia de archivo en raíz | `components.json` → shadcn |
| `fileExtensions` | escaneo recursivo (profundidad 4, con dirs excluidos) | `.swift` → SwiftUI |
| `gems` | parseo de `Gemfile` con regex | `rails` |
| `configFileContent` | patrones de texto dentro de archivos (soporta layouts Gradle y .NET: parsea `settings.gradle` para encontrar módulos, escanea `.sln`/`.csproj` a profundidad 2) | `pyproject.toml` contiene `fastapi` |

Además resuelve **monorepos**: lee `pnpm-workspace.yaml`, `workspaces` de package.json y workspaces de Deno, ejecuta la detección en cada workspace y deduplica por id. Y cachea lecturas de archivo por ejecución.

### 2. Dos capas de inteligencia encima del mapa

- **Combos** (`COMBO_SKILLS_MAP`): skills que solo tienen sentido con combinaciones — Next.js + Supabase, React Hook Form + Zod, GSAP + React, Expo + Tailwind. `requires: ["nextjs", "supabase"]` → añade skills extra.
- **Bonus frontend**: si detecta cualquier framework frontend (por paquetes o por extensiones `.tsx`, `.vue`, `.css`…) añade skills transversales: `frontend-design`, `accessibility`, `seo`. Es la idea de "skills por perfil de proyecto", no por dependencia concreta.

### 3. Modelo de seguridad del registry

Esto es lo más alineado con Skill Control. No instala desde repos upstream en runtime:

1. Los maintainers sincronizan skills a un registry local del repo (`sync-skills.mjs`).
2. Cada skill pasa una **revisión LLM automatizada** contra prompt-injection y supply-chain; el veredicto se guarda en el manifiesto (`review: { status, flags, summary, model, promptVersion, reviewedAt }`).
3. El manifiesto `index.json` registra **SHA-256 por archivo + bundleHash** y el `commitSha` de origen.
4. Al instalar, el CLI descarga solo lo necesario, verifica cada archivo contra el hash antes de escribir, y anota origen + hash en `skills-lock.json`.
5. URLs de descarga versionadas con fallback (`/v{version}/...` → `/main/...`) y caché en `~/.cache/autoskills`.

### 4. Instalación multi-agente con copia canónica

Instala **una sola copia canónica** en `.agents/skills/<skill>` y crea **symlinks** desde `.claude/skills`, `.cursor/skills`, etc. Detecta qué agentes usa el usuario mirando `~/.claude`, `~/.cline`, `~/.continue`… (`AGENT_FOLDER_MAP`), y permite forzar con `-a cursor claude-code`.

### 5. UX

`npx autoskills` sin config: banner → tecnologías detectadas (con cuáles tienen skills y cuáles no) → multiselect con skills ya instaladas marcadas (idempotente, lee el lockfile) → confirmación → instalación con verificación. Flags: `-y`, `--dry-run`, `-v`, `--clear-cache`. Incluye un `cleanupClaudeMd` que limpia restos de instalaciones antiguas en `CLAUDE.md`.

---

## Qué integrar en Skill Control (y qué no)

Skill Control ya tiene lo que autoskills no tiene: inventario, diagnóstico, comparación de copias, archivo reversible, GUI. Lo que le falta es exactamente lo que autoskills hace: **de una carpeta a una lista de skills recomendadas e instaladas**. Encajan sin solaparse.

### Adoptar tal cual (conceptos, no código — ver licencia abajo)

**A. Motor de detección declarativo en Rust.** Portar el modelo `SKILLS_MAP` como datos (JSON/TOML embebido o descargable), no como código. Criterios mínimos del MVP: `packages` + `configFiles` cubren el 80% de casos. Ventaja de que sea datos: el directorio curado podrá actualizar el mapa sin publicar versión nueva de la app. `lib.rs` ya tiene `discover_projects` y detección de marcadores (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`…): la detección de stack es una extensión natural de `scan_candidate`.

**B. Combos y bonus por perfil.** Baratos de implementar una vez existe el mapa y diferencian mucho la recomendación ("usas Next + Supabase, esto te interesa").

**C. Verificación por hash + `skills-lock.json`.** Skill Control ya calcula SHA-256 (`skill_hash`) y ya **lee** `skills-lock.json` (`read_lock_metadata`, `lock_entry`). Falta escribirlo al instalar: origen, commitSha, bundleHash. Eso da interoperabilidad directa con usuarios de autoskills y skills.sh, y alimenta el diagnóstico de "copias divergentes" que ya existe.

**D. Formato de registry con revisión.** Para el directorio propio (siguiente fase), adoptar el esquema de `index.json` de autoskills: hashes por archivo, bundleHash, metadata de revisión. Skill Control ya tiene una base SQLite de reputación (`record_external_reputation`, `record_skill_review`) — el registry es la fuente pública de eso mismo.

### Adaptar (mejorando lo que hace autoskills)

**E. UI de recomendación en Discover.** El equivalente GUI del flujo CLI: al añadir carpeta → chips de "Stack detectado" → lista de skills recomendadas con la *razón* visible ("porque usas React", "porque usas Next.js + Supabase") → estado instalada/no instalada → multiselección → instalar con el flujo transaccional que ya existe. La razón visible es lo que lo hace usable por alguien no técnico: entiende *por qué* se le sugiere algo.

**F. Copia canónica + symlinks en vez de copias duplicadas.** Hoy Skill Control instala copiando a `.agents/skills` y `.claude/skills` por separado, y luego tiene que detectar divergencias entre copias. El modelo de autoskills (canónica + symlinks) elimina el problema de raíz. Ojo: el README actual dice que el escáner no sigue symlinks — habría que tratarlos como instalación válida de primera clase.

**G. Detección más allá del código.** Aquí está la diferenciación real frente a autoskills, que solo entiende de stacks de desarrollo. Skill Control apunta a "cualquier persona, aunque no sea developer". El mismo motor declarativo sirve: una carpeta con `.xlsx` y facturas → skills de finanzas/gestoría; carpeta con `.docx`/`.md` de contenido → skills de escritura; carpeta con `.psd`/`.fig` → diseño. Es añadir entradas al mapa con criterio `fileExtensions` + categorías no-dev en el directorio. Nadie está haciendo esto.

### Descartar

- CLI propio: Skill Control es GUI; para CLI ya existe autoskills.
- Revisión LLM en la app cliente: la revisión pertenece al pipeline del directorio (servidor/CI), no al cliente. El cliente solo verifica hashes y muestra el veredicto.
- Descarga desde upstream en runtime: mantener el principio de registry curado.

---

## Directorio curado por categorías (siguiente paso que mencionas)

Propuesta de estructura, compatible con el formato autoskills pero con una capa de categorías:

- `index.json`: manifiesto con hashes + revisión (esquema autoskills).
- `categories.json`: capa propia — categorías por rol (Desarrollo por stack, Escritura, Finanzas, Legal, Diseño, Productividad…), skills destacadas, y el mapa de detección (tecnologías Y tipos de carpeta → skills).
- Fuentes: skills propias + sincronización revisada desde skills.sh / repos oficiales (Anthropic, Vercel, Cloudflare…), igual que hace autoskills con su `sync-skills`.

La app consume el directorio por HTTP con caché local y fallback offline, y el mapa de detección viaja con él: recomendaciones nuevas sin actualizar la app.

## Plan de acción propuesto

1. **MVP Auto Skills** — mapa de detección en Rust (datos embebidos, ~25 tecnologías: packages + configFiles), comando Tauri `detect_stack(folder)`, UI de recomendaciones en Discover con razones e instalación por el flujo existente. Es el corazón; todo lo demás cuelga de esto.
2. **Lockfile + verificación** — escribir `skills-lock.json` al instalar, verificar SHA-256 contra manifiesto, mostrar procedencia en Inspector.
3. **Directorio v1** — registry propio con formato compatible, categorías por rol, servido estático (GitHub raw o CDN). El mapa de detección se mueve del binario al directorio.
4. **Detección no-dev** — perfiles de carpeta por contenido (extensiones/estructura) → categorías del directorio.
5. **Combos, bonus por perfil y symlinks canónicos** — pulido que multiplica la calidad de la recomendación y elimina divergencias.

## ⚠️ Licencia

autoskills es **CC BY-NC 4.0** (no comercial). No se puede copiar código ni el contenido del registry/mapa tal cual si Skill Control tiene cualquier vía comercial. Todo lo de arriba es reimplementación de ideas y formatos (los formatos y las ideas no están protegidos; el código y los textos sí). El mapa tecnología→skill hay que construirlo propio, aunque las skills enlazadas (de Vercel, Anthropic, etc.) tengan sus propias licencias, generalmente permisivas — revisar una a una al montar el directorio.
