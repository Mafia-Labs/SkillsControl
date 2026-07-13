# Skill Control

> Un centro de control local para entender, revisar y mantener las *skills* que usan tus agentes.

**Skill Control** reúne en una aplicación de escritorio las skills instaladas para Codex/Agent Skills y Claude Code. En vez de navegar carpetas ocultas y editar archivos a mano, muestra dónde está activa cada copia, detecta problemas estructurales y aplica cambios reversibles.

<p align="center">
  <code>Inventario local</code> · <code>Diagnóstico</code> · <code>Instalación por proyecto</code> · <code>Archivo reversible</code>
</p>

## Decisión de producto

El alcance recomendado es **proyecto o carpeta**, no global.

Una skill global aparece en trabajos donde quizá no aporta nada. Una skill local vive junto al código, puede versionarse con el repositorio y queda disponible solo para los agentes que trabajan en ese ámbito. El modo global sigue existiendo para capacidades realmente universales.

## Qué resuelve

| Necesidad | Cómo ayuda Skill Control |
| --- | --- |
| Saber qué hay instalado | Escanea las ubicaciones globales y locales reconocidas por Codex y Claude Code. |
| Descubrir proyectos automáticamente | Al añadir una o varias carpetas de trabajo, encuentra repositorios, paquetes y carpetas con skills locales hasta 32 niveles de profundidad. |
| Instalar para todo el proyecto | Crea la skill en `.agents/skills`, `.claude/skills` o en ambas ubicaciones en una sola operación. |
| Convertir una skill global en local | Copia la carpeta completa al proyecto para el mismo agente; después puedes verificarla y archivar la global. |
| Evitar contexto innecesario | Selecciona proyecto por defecto; el alcance global requiere una decisión explícita. |
| Ver copias distintas | Compara hashes de todos los archivos de cada instalación y avisa cuando dos copias con el mismo nombre han divergido. |
| Desinstalar con seguridad | Archiva únicamente la instalación seleccionada y permite restaurarla en su ruta original. |
| Detectar riesgos básicos | Señala metadatos incompletos, descripciones ausentes, scripts ejecutables y definiciones demasiado grandes. |

## Rutas compatibles

| Agente | Global | Proyecto o carpeta |
| --- | --- | --- |
| Codex / Agent Skills | `~/.agents/skills` | `<carpeta>/.agents/skills` |
| Claude Code | `~/.claude/skills` | `<carpeta>/.claude/skills` |

Codex busca `.agents/skills` desde el directorio de trabajo hasta la raíz del repositorio. Claude Code usa `.claude/skills` en el proyecto y también puede descubrir ámbitos anidados. Por eso Skill Control trata una carpeta local como una unidad real de configuración, no solo la raíz superior de un repositorio.

Una skill se reconoce como una carpeta que contiene `SKILL.md`. El recorrido general del workspace no sigue enlaces para evitar ciclos y salidas accidentales del árbol elegido; las copias que contienen enlaces simbólicos no se migran automáticamente.

## Descubrimiento de workspace

Al añadir una o varias carpetas, el escáner:

1. La conserva como destino local aunque todavía no tenga archivos de proyecto.
2. Detecta repositorios y paquetes mediante `.git`, `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml` y otros marcadores comunes.
3. Encuentra ámbitos anidados que ya contengan `.agents/skills` o `.claude/skills`.
4. Ignora dependencias y artefactos como `node_modules`, `target`, `dist`, `build`, `.next`, `.venv`, `vendor` y `coverage`.
5. Asocia cada instalación con su carpeta de proyecto para que la interfaz no tenga que inferirla desde una cadena de texto.
6. Lee `~/.agents/.skill-lock.json`, `skills-lock.json` y variantes locales para recuperar origen, ruta y referencia sin inventar un commit que no esté registrado.

## Instalación local

En **Discover** se eligen tres cosas por separado:

1. **Ámbito:** proyecto/carpeta o global.
2. **Cobertura:** todos los agentes compatibles, Codex/Agent Skills o Claude Code.
3. **Destino local:** el proyecto o paquete detectado.

Cuando se eligen todos los agentes, la instalación es transaccional: primero comprueba todos los destinos, después crea las copias y revierte las ya creadas si falla una de ellas. Nunca sobrescribe una carpeta existente.

## De global a proyecto

Desde el inspector, **Install in project** copia una instalación existente —incluidos scripts, referencias y recursos— al proyecto seleccionado para el mismo agente. La copia es atómica y la fuente no se elimina. El flujo recomendado es:

1. copiar la skill al proyecto;
2. comprobar que el agente la detecta y funciona;
3. desactivar la copia global solo cuando ya no sea necesaria.

Los enlaces simbólicos internos no se copian automáticamente, porque podrían apuntar fuera de la skill y convertir una operación aparentemente local en una lectura arbitraria.

## Desactivación y restauración

**Disable** actúa sobre una instalación exacta, no sobre todas las copias con el mismo nombre. El backend valida que el destino sea realmente una skill bajo `.agents/skills` o `.claude/skills`, la mueve a `~/.skill-control/disabled/<id>` y registra la operación en SQLite.

La restauración recibe solo el identificador del archivo guardado y recupera el resto de los datos desde la base local. Esto evita confiar en rutas arbitrarias enviadas por la interfaz.

## Comprobaciones de salud

El análisis no ejecuta instrucciones ni scripts, y ahora funciona como una primera capa de confianza local. Comprueba:

- frontmatter YAML delimitado por `---`;
- `description` no vacía;
- coherencia entre carpeta y `name`;
- `SKILL.md` inferior a 20&nbsp;000 caracteres;
- SHA-256 determinista de todos los archivos y recursos;
- scripts ejecutables y scripts invocados desde `SKILL.md`, aunque no tengan bit ejecutable;
- comandos destructivos, elevación de privilegios, descargas y ejecución remota;
- referencias a credenciales, exfiltración potencial, ofuscación y ejecución dinámica;
- binarios, enlaces simbólicos, hooks/MCP y escrituras fuera del proyecto;
- copias con el mismo nombre pero distinto contenido;
- solapamientos globales y locales para un mismo agente.

El escáner es determinista, offline y produce evidencias/capacidades, no una garantía de seguridad. Solo usa `SKILL.md` y los scripts que este invoque expresamente para analizar comportamiento; la documentación auxiliar se conserva como contexto. Los estados son `Reviewed`, `Low risk`, `Review required`, `Blocked`, `Unknown` y `Stale`. Una versión bloqueada no se puede copiar a otro proyecto. `Trust this exact version` guarda la aceptación ligada al hash SHA-256 exacto; si cambia un archivo, esa confianza no se hereda.

La procedencia se conserva cuando existe en el frontmatter o en los lockfiles (`source_url`, `source_repository`, `source_commit`, `source_ref`, `source_skill_path`, `license` e `installed_at`). Si un campo no está disponible, la interfaz lo muestra como no registrado en vez de inferirlo.

La cuarentena mueve una instalación exacta al archivo reversible de Skill Control. La restauración nunca sobrescribe una carpeta existente.

La aplicación usa una CSP Tauri con scripts locales, sin `unsafe-eval`, sin scripts remotos y con conexiones limitadas al canal local de desarrollo. La comprobación online es opcional y hash-bound: el botón **Check online reputation** envía solo el identificador `owner/repository/skill` y el SHA-256 local. Nunca sube el contenido de una skill privada.

## Reputación online opcional

Skill Control puede consultar el detalle y las auditorías agregadas de [skills.sh](https://skills.sh/docs/api). La reputación no sustituye el análisis local:

- Si el hash auditado coincide, muestra los proveedores por separado y conserva sus desacuerdos (`pass`, `warn` o `fail`).
- Si el hash no coincide, muestra `Version not covered` y no reutiliza auditorías anteriores.
- Un `fail` externo con hash coincidente bloquea por defecto; popularidad, instalaciones y estrellas son señales de contexto, nunca pruebas de seguridad.
- Los resultados se almacenan localmente por `skillId + hash` en SQLite.

Para producción, despliega `api/skills-reputation.ts` en Vercel con OIDC habilitado y compila la aplicación con el proxy configurado:

```bash
SKILL_CONTROL_REPUTATION_PROXY_URL=https://tu-proyecto.vercel.app/api/skills-reputation pnpm exec tauri build
```

El proxy usa `VERCEL_OIDC_TOKEN` para llamar a la API autenticada de skills.sh. Si no se configura, el escritorio intenta los endpoints públicos directamente sin credenciales; una respuesta que requiera autenticación se muestra como error, no como reputación favorable.

## Seguridad de escritura

- Los identificadores de catálogo solo aceptan minúsculas, números, guiones y guiones bajos; se rechaza cualquier intento de *path traversal*.
- Antes de desactivar, se verifica que la instalación coincide con el agente y ámbito declarados.
- Las instalaciones se escriben en una carpeta temporal y se renombran al final.
- Una instalación múltiple se revierte completa si uno de los destinos falla.
- Restaurar nunca sobrescribe una skill existente.

## Instalación y desarrollo

### Requisitos

- [Node.js](https://nodejs.org/) y [pnpm](https://pnpm.io/).
- Toolchain de [Rust](https://www.rust-lang.org/tools/install), necesario para Tauri.
- Dependencias de sistema de [Tauri 2](https://v2.tauri.app/start/prerequisites/).

### Desarrollo

```bash
pnpm install
pnpm exec tauri dev
```

Solo frontend, con datos de demostración:

```bash
pnpm dev
```

Validación y empaquetado:

```bash
pnpm test
pnpm build
pnpm exec tauri build
```

## Arquitectura

```text
src/                       React + TypeScript + Vite
├── components/            Overview, Map, Discover, Health e Inspector
├── lib/desktop.ts         Puente tipado con comandos Tauri
├── lib/types.ts           Modelo de agentes, proyectos e instalaciones
└── lib/skill-utils.ts     Salud, solapamientos y presentación

src-tauri/
└── src/lib.rs             Descubrimiento, validación, instalación atómica,
                           archivo reversible y restauración
```

## Uso rápido

1. Abre la aplicación para inspeccionar las ubicaciones globales.
2. Pulsa **Add folder** y selecciona explícitamente un repositorio o una carpeta que contenga varios proyectos. Una app abierta desde el Dock o el explorador no tiene un directorio de proyecto fiable.
3. Revisa los ámbitos detectados en **Skill Map**.
4. Usa **Install in project** para localizar una skill ya instalada, o **Discover** para instalar una skill curada.
5. En **Discover**, conserva **Project or folder** y **All compatible agents** salvo que exista un motivo claro para ampliar o reducir el alcance.
6. Desactiva una copia concreta desde el inspector y restáurala desde **Disabled skills**.

## Estado

Skill Control está en fase inicial (`0.1.0`). La biblioteca curada es pequeña y el diagnóstico sigue siendo estructural. Revisa siempre las instrucciones y scripts de una skill de terceros antes de confiar en ella.

---

Hecho para que cada proyecto cargue las skills que necesita, no todas las que existen.
