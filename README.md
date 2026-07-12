# Skill Control

> Un centro de control local para entender, revisar y mantener las *skills* que usan tus agentes.

**Skill Control** reúne en una sola aplicación de escritorio las skills instaladas para Agent Skills, Codex y Claude. En vez de navegar carpetas ocultas y editar archivos a mano, puedes ver dónde está activa cada skill, detectar problemas estructurales y aplicar cambios reversibles.

<p align="center">
  <code>Inventario local</code> · <code>Diagnóstico</code> · <code>Instalación curada</code> · <code>Archivo reversible</code>
</p>

## Qué resuelve

Cuando una misma skill existe en varios agentes o proyectos, es fácil perder el contexto: qué copia se está usando, cuál tiene prioridad y si su definición es segura de activar. Skill Control lo hace visible de un vistazo.

| Necesidad | Cómo ayuda Skill Control |
| --- | --- |
| Saber qué hay instalado | Escanea las carpetas de skills de Agent Skills, Codex y Claude, tanto globales como de proyecto. |
| Entender prioridades | Muestra una matriz por agente y ámbito; las instalaciones de proyecto tienen prioridad sobre las globales. |
| Encontrar problemas antes de activar | Señala metadatos incompletos, descripciones ausentes, scripts ejecutables, duplicados y definiciones demasiado grandes. |
| Desactivar sin perder nada | Mueve una skill a un archivo local y permite restaurarla en su ubicación original. |
| Añadir una base cuidada | Instala una pequeña colección de skills curadas en el agente o proyecto elegido. |

## Funciones

- **Vista general:** número de skills, agentes detectados, proyectos, duplicados y una estimación de huella de contexto.
- **Skill Map:** matriz de alcance para comparar instalaciones globales y de proyecto por cada agente.
- **Health check:** comprobaciones estructurales realizadas localmente, sin ejecutar las skills.
- **Inspector:** archivos, scripts ejecutables, instalaciones y hallazgos de cada skill.
- **Archivo de seguridad:** al desactivar una skill se conserva en `~/.skill-control/disabled/` y queda registrada para restaurarla después.
- **Biblioteca curada:** incluye `repo-hygiene`, `web-performance` y `api-contracts`.
- **Proyectos adicionales:** añade carpetas desde la interfaz para incluir sus skills en el inventario.

## Rutas que analiza

Skill Control busca carpetas de skills en los ámbitos global y de proyecto:

| Agente | Global | Proyecto |
| --- | --- | --- |
| Agent Skills | `~/.agents/skills` | `<proyecto>/.agents/skills` |
| Codex | `~/.codex/skills` | `<proyecto>/.codex/skills` |
| Claude | `~/.claude/skills` | `<proyecto>/.claude/skills` |

Una skill se reconoce como una carpeta que contiene un archivo `SKILL.md`. Si hay copias con el mismo nombre, la aplicación las agrupa y avisa de la duplicidad.

## Comprobaciones de salud

El análisis actual es deliberadamente sencillo y explicable. No intenta ejecutar instrucciones ni evaluar código; verifica que cada `SKILL.md` tenga una forma razonable:

- frontmatter YAML delimitado correctamente por `---`;
- campo `description` no vacío;
- coherencia entre el nombre de la carpeta y el campo `name`;
- tamaño de `SKILL.md` inferior a 20&nbsp;000 caracteres, para evitar una activación innecesariamente pesada;
- scripts ejecutables bajo `scripts/`, para que puedan revisarse antes de usarlos;
- instalaciones múltiples de una misma skill.

Los avisos son orientación, no bloqueos: una skill con un aviso sigue siendo visible e inspeccionable.

## Instalación y desarrollo

### Requisitos

- [Node.js](https://nodejs.org/) y [pnpm](https://pnpm.io/).
- Toolchain de [Rust](https://www.rust-lang.org/tools/install), necesario para Tauri.
- Las dependencias de sistema de [Tauri 2](https://v2.tauri.app/start/prerequisites/) para tu sistema operativo.

### Arrancar la aplicación de escritorio

```bash
pnpm install
pnpm exec tauri dev
```

### Ejecutar solo el frontend

```bash
pnpm dev
```

En modo navegador no se accede al sistema de archivos: la interfaz carga datos de demostración para poder revisar el diseño sin permisos nativos.

### Validar y empaquetar

```bash
pnpm test
pnpm build
pnpm exec tauri build
```

La configuración actual genera el bundle de aplicación para macOS (`app`). El código se basa en Tauri 2, por lo que puede adaptarse a otros targets configurando el empaquetado y sus requisitos de sistema.

## Uso rápido

1. Abre la aplicación: el primer escaneo inspecciona las rutas globales y el proyecto actual.
2. Usa **Add project** para añadir otros repositorios que quieras controlar.
3. En **Skill Map**, selecciona una fila para consultar archivos, ubicaciones y advertencias.
4. Abre **Health** para priorizar los errores y avisos detectados.
5. Para retirar una instalación, selecciónala y elige **Disable**. Antes verás una previsualización del cambio.
6. Restaura cualquier elemento desde **Disabled skills** cuando lo necesites.

## Privacidad y cambios en disco

La aplicación funciona en local. El escaneo lee `SKILL.md` y enumera archivos de las carpetas de skills; no sube su contenido ni ejecuta sus scripts.

Los únicos cambios que puede realizar desde la interfaz son:

- crear una skill de la biblioteca curada en la ubicación elegida;
- mover una skill desactivada a `~/.skill-control/disabled/<id>`;
- registrar ese movimiento en `~/.skill-control/state.db`;
- restaurar posteriormente esa copia a su ruta original.

Al restaurar, la operación se detiene si ya existe una carpeta en el destino original. Así se evita sobrescribir una skill de forma accidental.

## Arquitectura

```text
src/                       React + TypeScript + Vite
├── components/            Vistas: Overview, Map, Discover, Health e Inspector
├── lib/desktop.ts         Puente entre la interfaz y los comandos nativos
└── lib/skill-utils.ts     Cálculos y presentación del estado de salud

src-tauri/                 Backend nativo de Tauri (Rust)
├── src/lib.rs             Escaneo, validación, archivo y restauración
└── tauri.conf.json        Ventana y configuración de empaquetado
```

La interfaz invoca comandos de Tauri para escanear, instalar, desactivar, restaurar y listar el archivo. El backend Rust mantiene la lógica que toca el sistema de archivos; la UI no manipula rutas directamente.

## Stack

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 5](https://vite.dev/)
- [Tauri 2](https://v2.tauri.app/) + Rust
- [SQLite](https://www.sqlite.org/) embebido mediante `rusqlite`, para el historial de archivado
- [Vitest](https://vitest.dev/)

## Scripts disponibles

| Comando | Acción |
| --- | --- |
| `pnpm dev` | Inicia el frontend de Vite. |
| `pnpm build` | Comprueba TypeScript y genera el frontend en `dist/`. |
| `pnpm test` | Ejecuta los tests de Vitest una vez. |
| `pnpm test:watch` | Ejecuta Vitest en modo observación. |
| `pnpm exec tauri dev` | Abre la app de escritorio en desarrollo. |
| `pnpm exec tauri build` | Genera un paquete nativo distribuible. |

## Estado del proyecto

Skill Control está en una fase inicial (`0.1.0`). La biblioteca curada es intencionadamente pequeña y el diagnóstico se centra en la estructura de las skills. Antes de confiar en una skill de terceros, revisa siempre sus instrucciones y sus scripts.

---

Hecho para que tus agentes tengan menos sorpresas y tus carpetas ocultas, menos misterio.
