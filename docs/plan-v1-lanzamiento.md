# Skill Control — Estado del proyecto y plan hasta v1.0 lanzable

Fecha: 2026-07-14 · Base: commit `a545051` · Versión actual: 0.1.0

---

## 1. Estado actual (análisis PM)

### Lo que está construido y es sólido

**Backend Rust (`lib.rs`, ~2.600 líneas, 20 tests):**

- Escaneo de instalaciones globales y por proyecto (Codex `.agents/skills`, Claude Code `.claude/skills`), descubrimiento profundo de workspaces con marcadores de proyecto.
- Hashing SHA-256 determinista, detección de copias divergentes, lectura de lockfiles (`skills-lock.json` y variantes).
- Análisis de seguridad estructural: scripts, comandos destructivos, exfiltración, ofuscación, symlinks, binarios. Estados de confianza hash-bound (`Trust this exact version`).
- Disable/quarantine/restore reversible con SQLite, validación de rutas en backend (no confía en la UI).
- Instalación transaccional multi-destino con rollback. Nunca sobrescribe.
- Reputación online hash-bound opcional (privacy-first: solo id + hash).
- **Motor de detección de stack (`detection.rs`, 1.272 líneas, 12 tests)** con mapa declarativo (`detection-map.json`, ~25 tecnologías). Recién implementado, motor puro.

**Otros activos:** CSP endurecida sin `unsafe-eval`, análisis competitivo de autoskills documentado, prompt de implementación del MVP listo, función serverless de reputación (`api/skills-reputation.ts`).

### Lo que falta o está roto (los gaps que bloquean el lanzamiento)

| Gap | Gravedad | Detalle |
| --- | --- | --- |
| **Auto Skills sin cablear** | 🔴 Bloqueante | `detection.rs` existe pero no hay comando Tauri `detect_stack` expuesto ni UI que lo consuma. El motor está muerto en el binario. |
| **Discover es un stub con datos falsos** | 🔴 Bloqueante | 13 líneas leyendo `demo-data.ts`. El catálogo curado que promete el README no existe como fuente real. |
| **Frontend mínimo** | 🟠 Alto | ~660 líneas totales de componentes. Overview/Inspector/Health funcionan pero son delgados; falta la experiencia central de recomendación. |
| **No escribe lockfile al instalar** | 🟠 Alto | Lee `skills-lock.json` pero no lo escribe → sin procedencia propia ni interop con autoskills/skills.sh. |
| **Sin pipeline de release** | 🔴 Bloqueante | Bundle solo `app` (ni .dmg ni .msi), sin firma/notarización macOS, sin updater, sin CI, sin releases en GitHub. Nadie puede instalarlo. |
| **Sin canal de distribución** | 🔴 Bloqueante | Sin landing, sin dominio, sin analítica de descargas. |
| **Sin monetización** | 🔴 Bloqueante | Sin licencias, sin checkout, sin gating de features. |
| **API de reputación huérfana** | 🟡 Medio | `api/skills-reputation.ts` no tiene deploy documentado ni URL configurada. |
| **README sobrevende** | 🟡 Medio | Describe la biblioteca curada y flujos de Discover que aún son demo. |

### Lectura de PM

El backend es la parte difícil y está hecha, con criterio de seguridad por encima de la media del nicho. El problema es clásico: **90% de motor, 10% de producto**. Nada de lo construido es usable ni comprable por nadie hoy. La feature diferencial (Auto Skills: "añade tu carpeta y te digo qué skills necesitas y por qué") está a un sprint de existir, y es exactamente la que justifica cobrar. Prioridad absoluta: cerrar el loop detección → recomendación → instalación, y hacer la app instalable.

Riesgo de perfeccionismo detectado: el historial reciente son 6 commits de seguridad/procedencia y un rebrand revertido. La seguridad ya es suficiente para v1; ningún usuario más va a llegar por un finding adicional del scanner. Llegarán por Auto Skills y por poder descargar la app.

---

## 2. Plan de ingeniería hasta v1.0

Orden por dependencias y por valor. Cada fase termina en algo demostrable.

### Fase 1 — Cerrar Auto Skills MVP (el corazón) · ~1 semana

1. **Comando Tauri `detect_stack(project_path)`** que envuelve `detection::detect` y devuelve `{ technologies, recommendations, reasons }`. Tipos espejo en `types.ts` + wrapper en `desktop.ts`.
2. **Reescribir `Discover.tsx`**: selector de proyecto (reutilizar workspace discovery) → "Analizar proyecto" → chips de stack detectado (incluyendo tecnologías sin skills, atenuadas) → skills recomendadas agrupadas con **razón visible** ("porque usas Next.js") → multiselección → instalación por el flujo transaccional existente. Idempotente: marca lo ya instalado.
3. **Escribir `skills-lock.json` al instalar** (origen, ref, hashes). Ya se lee; falta la mitad de escritura. Mostrar procedencia en Inspector.
4. Tests: unit del comando (fixtures de proyectos), test de UI del flujo con vitest.

*Salida: la historia de usuario completa funciona en local. Es la demo que vende el producto.*

### Fase 2 — Catálogo real (matar los datos demo) · ~1 semana

1. **Directorio v1 servido estático** (GitHub raw o CDN): `index.json` con hashes por archivo + bundleHash + metadata de revisión, y `categories.json` con categorías por rol y el mapa de detección. El mapa sale del binario → recomendaciones nuevas sin publicar app.
2. Seed del catálogo: 20–30 skills de fuentes oficiales permisivas (Anthropic, Vercel, Cloudflare), revisadas con el pipeline propio. **Cero contenido de autoskills (CC BY-NC).**
3. Cliente: fetch con caché local y fallback offline; verificación SHA-256 contra manifiesto antes de escribir; `demo-data.ts` queda solo para `pnpm dev`.
4. Desplegar `api/skills-reputation.ts` (Vercel/Cloudflare) y configurar la URL en la app.

*Salida: Discover muestra contenido real, verificado, actualizable sin release.*

### Fase 3 — Hacerla instalable (release engineering) · ~1 semana

1. **macOS primero** (el público de agentes IA vive mayoritariamente ahí): bundle `dmg`, firma con Developer ID + **notarización** (sin esto, Gatekeeper mata la instalación y la conversión). Apple Developer Program: 99 €/año.
2. **CI en GitHub Actions**: `cargo test` + `vitest` + build en PR; tag → build firmado → GitHub Release.
3. **Updater de Tauri** con firma de updates. Imprescindible antes de tener usuarios: sin updater, cada bug queda instalado para siempre.
4. Windows/Linux: compilar y publicar sin firma EV (aviso SmartScreen asumible en v1). No bloquear el lanzamiento por esto.
5. Versionado semántico + CHANGELOG.

*Salida: cualquiera descarga, instala y recibe updates.*

### Fase 4 — Lanzamiento público · ~1 semana en paralelo con la 3

1. **Landing** (dominio propio): hero con la demo de Auto Skills en vídeo/gif, tabla free vs Pro, descarga directa. Un mensaje: *"Añade tu carpeta. Te decimos qué skills necesitan tus agentes, por qué, y si son seguras."*
2. Alinear el README con la realidad + docs mínimas de uso.
3. Distribución: Homebrew cask, Show HN, r/ClaudeAI, X/comunidad de agentes, y tu propio canal (La Mafia IA es distribución gratuita ya construida — úsala).
4. Telemetría **opt-in** mínima (instalaciones, versión) o solo contadores de descarga; coherente con el posicionamiento privacy-first.

### Fase 5 — Cobro · 3–4 días

Ver §3. Técnicamente: integrar checkout (Lemon Squeezy/Polar como merchant of record → ellos gestionan el IVA UE, crítico siendo autónomo en España), validación de licencia offline-first (clave firmada Ed25519, sin phone-home obligatorio, coherente con el producto), y gating de features Pro en el frontend + backend.

**Total realista hasta v1.0 cobrable: 4–5 semanas a dedicación completa.**

### Explícitamente fuera de v1 (no perfeccionismo)

- Symlinks canónicos multi-agente (Fase F del análisis) → v1.1.
- Detección no-dev (carpetas de finanzas/escritura/diseño) → v1.1–v1.2. Es la diferenciación a medio plazo, pero no bloquees el lanzamiento por ella.
- Combos y bonus por perfil → v1.1 (baratos una vez existe el mapa, pero después de lanzar).
- Firma EV de Windows, App Store de macOS, revisión LLM en cliente, CLI propio.

---

## 3. Por qué cobrar y por qué

### Modelo recomendado: **freemium con Pro de pago único + año de updates**

- **Free (motor de adopción):** inventario, salud básica, Auto Skills con detección core, instalar desde el catálogo, disable/restore. Suficiente para ser la herramienta que todo el mundo recomienda.
- **Pro — 39–59 € pago único, 1 año de updates (modelo tipo Sublime/Kaleidoscope):**
  - Scanner de seguridad completo + estados de confianza hash-bound + cuarentena.
  - Reputación online y verdicts.
  - Comparación de copias divergentes y procedencia completa.
  - Workspaces ilimitados (free: 2–3 carpetas).
  - Combos/perfiles y detección no-dev cuando lleguen.
- **Más adelante (v1.2+), Teams por suscripción (~8–12 €/asiento/mes):** políticas de skills permitidas/bloqueadas por organización, registry privado, confianza compartida entre máquinas. Aquí está el dinero recurrente real: el pitch de seguridad ("qué está inyectando contexto en los agentes de mi equipo") lo paga una empresa sin pestañear, no un indie.

### Por qué así y no de otra forma

- Suscripción individual para una utility local: fricción alta, churn alto, y contradice el posicionamiento local/privacy-first. Pago único convierte mejor en este nicho.
- El *free* debe incluir Auto Skills básico porque es el gancho viral; el *Pro* vende **confianza** (seguridad, procedencia, reputación), que es donde el backend ya es superior a todo lo que existe.
- Precio de referencia: utilities de desarrollador macOS bien acabadas cobran 30–80 € (validar contra el mercado en el momento del lanzamiento; no tengo datos post-2025 verificados).
- Merchant of record obligatorio para no cargarte la contabilidad de IVA intracomunitario.

### Riesgos a vigilar

1. **Licencia autoskills (CC BY-NC):** en cuanto cobras, cualquier código/texto/mapa copiado es infracción. Reimplementación limpia estricta, mapa propio.
2. **Timing:** el espacio de gestión de skills se mueve rápido; cada semana sin lanzar es riesgo de que Anthropic o autoskills cubran el hueco. Refuerza la Fase 1 como prioridad única.
3. **Un solo mantenedor:** el catálogo curado prometido implica revisión continua. Automatiza el pipeline de sync/revisión desde el día 1 o el catálogo se pudre.

---

## 4. Checklist de "listo para lanzar"

- [ ] `detect_stack` expuesto y Discover real end-to-end
- [ ] Catálogo remoto con ≥20 skills verificadas por hash
- [ ] Lockfile escrito al instalar, procedencia visible
- [ ] .dmg firmado y notarizado + updater funcionando
- [ ] CI verde en cada PR, release automatizada por tag
- [ ] Landing con descarga + checkout Pro operativo
- [ ] README y docs alineados con lo que la app hace de verdad
- [ ] Probado en una máquina limpia (sin toolchain de dev) por alguien que no seas tú
