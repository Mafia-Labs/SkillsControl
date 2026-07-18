# Skill Control: revisión PM/UX y plan de implementación

Fecha: 2026-07-18

## Decisión de producto

Skill Control debe ser un inventario **project-first** y un gestor del ciclo de vida de cada instalación física de una skill.

La regla de producto será:

1. La instalación local en proyecto o carpeta es el valor por defecto.
2. Una instalación global es una excepción visible, cuantificada y fácil de resolver.
3. Copiar, mover, desinstalar y restaurar son acciones de primer nivel.
4. “Skill” e “instalación” no son lo mismo: una skill puede tener varias copias para distintos agentes y ámbitos.
5. Un workspace puede contener proyectos, paquetes y ámbitos anidados; la interfaz debe mostrar esa jerarquía sin convertir cada subcarpeta en un proyecto principal.

## Auditoría del flujo actual

Se revisaron estos recorridos en la aplicación local:

1. Proyectos e inventario global: funcional, pero la acción de desinstalación no es visible y la sección global queda por debajo de los proyectos.
2. Detalle de proyecto: la separación entre copias locales y globales es valiosa; las acciones destructivas vuelven a quedar ocultas.
3. Inspector de skill: ofrece buena procedencia y seguridad, pero no permite editar ni abrir el archivo y usa “cuarentena” para varios significados.
4. Conversión global a proyecto: copia de forma segura, pero obliga a un segundo flujo manual para retirar la copia global.

### Fortalezas que se deben conservar

- El principio “primero local” ya aparece en la navegación y el copy.
- El backend opera sobre una instalación concreta, no sobre todas las copias con el mismo nombre.
- Desinstalar ya es reversible mediante archivo y restauración.
- El inspector muestra agente, ámbito, ruta, hash, procedencia y hallazgos.
- La copia a proyecto valida el origen, evita sobrescritura y usa escritura atómica.
- El detalle de proyecto separa correctamente las skills instaladas allí de las globales que también le afectan.

### Hallazgos P0

#### 1. La acción de desinstalar está visualmente rota

Existe un botón accesible con el símbolo `⊘`, pero una regla global de `.icon-button` lo posiciona de forma absoluta. En las listas de proyectos y skills globales los botones terminan solapados o desplazados fuera de la fila. Esto explica por qué el usuario no encuentra la desinstalación aunque el DOM sí la contenga.

Decisión:

- Limitar el posicionamiento absoluto a `.inspector .icon-button`.
- Usar posición estática dentro de `.row-actions`.
- Mostrar una acción con texto: **Desinstalar…**. El icono solo no es suficiente.
- Reservar **Poner en cuarentena** para una recomendación de seguridad, no como nombre genérico de desinstalación.

#### 2. Las tarjetas de proyecto tienen una zona clicable incoherente

Solo la cabecera de la tarjeta abre el proyecto. Los chips, el contador y el espacio restante parecen pertenecer a la misma tarjeta, pero no navegan.

Decisión:

- Toda la tarjeta abre el proyecto con ratón y teclado.
- Si una tarjeta contiene otra acción, se implementará con un enlace superpuesto o una estructura sin controles anidados.
- El estado de foco debe abarcar visualmente toda la tarjeta.

#### 3. Los nombres de skill no navegan

En las listas globales y locales el nombre es texto, mientras “Inspeccionar” es el único acceso al detalle.

Decisión:

- El nombre de una skill abre el inspector.
- La fila completa no será clicable cuando contenga acciones de mover o desinstalar.
- “Inspeccionar” puede mantenerse temporalmente y retirarse cuando los tests de descubribilidad confirmen que el nombre es suficiente.

#### 4. La navegación no representa el estado hijo

Desde el detalle de un proyecto, pulsar el elemento lateral “Proyectos” no vuelve al listado porque `selectedProjectPath` permanece activo. Solo funciona el enlace de retorno dentro de la vista.

Decisión:

- La navegación lateral a Proyectos siempre limpia la selección hija.
- El estado debe modelarse como ruta jerárquica (`projects` y `projects/:projectId`), aunque inicialmente siga siendo estado local.

### Hallazgos P1

#### 5. Global es una excepción, pero no se gestiona como tal

El aviso actual es correcto, aunque aparece después de las tarjetas de proyectos y no guía al usuario hacia una resolución completa.

Decisión:

- Mostrar arriba un resumen: `3 globales · 2 recomendadas para mover · coste estimado`.
- Cada skill global tendrá tres acciones visibles: **Mover a proyecto…**, **Desinstalar…** y un menú secundario.
- La opción global en los flujos de instalación seguirá disponible, pero con copy de excepción y sin ser el valor por defecto.
- Cuando no haya skills globales se mostrará un estado positivo breve, no un panel grande vacío.

#### 6. “Mover” actualmente solo copia

El modal explica correctamente que el origen se conserva, pero el usuario debe volver después para retirar la copia global.

Decisión:

- El modal incluirá `Desinstalar la copia global después de verificar la copia local`, activado por defecto.
- Desactivado significa **Copiar**; activado significa **Mover**.
- El resumen previo enumerará las rutas que se crean y la copia exacta que se archiva.
- La copia global solo se archivará si la copia local se completa, su hash coincide y el registro del archivo reversible puede persistirse.

#### 7. Proyecto, carpeta, paquete y ámbito están aplanados

El escáner actual añade como `ProjectSummary` toda carpeta con un marcador de proyecto o una raíz de skills. Por eso `SkillsControl/src-tauri` aparece como hermano de `SkillsControl` en lugar de como hijo.

Decisión de información:

```text
Workspace añadido
└── SkillsControl                    proyecto/repo principal
    ├── Ámbito raíz                 skills instaladas en SkillsControl
    └── src-tauri                   paquete o ámbito anidado
        └── skills locales          si existen en esa carpeta
```

- La pantalla principal muestra los workspaces/proyectos añadidos explícitamente.
- Los paquetes y ámbitos detectados dentro se muestran en el detalle del proyecto como árbol o lista indentada.
- Un ámbito anidado sigue siendo un destino válido de instalación.
- Si el usuario añade explícitamente una subcarpeta que ya pertenece a un workspace, se muestra su relación en vez de duplicarla silenciosamente.

#### 8. Los contadores mezclan conceptos

“2 skills” representa skills únicas, pero puede haber tres instalaciones físicas por agente o ámbito.

Decisión:

- Mostrar `skills únicas` e `instalaciones` como métricas distintas.
- Resumen mínimo: skills únicas, instalaciones globales, instalaciones locales, solapamientos y proyectos.
- El coste de contexto debe seguir marcado como estimación.
- Un contador de uso real no entra en esta fase: Codex y Claude no exponen hoy un evento común y fiable de invocación de skills.

#### 9. La búsqueda no coincide con la vista

El placeholder dice “Buscar skills”, pero en Proyectos filtra proyectos por nombre/ruta y no filtra la lista global.

Decisión:

- Usar búsqueda contextual: `Buscar proyectos, skills o rutas` en el inventario.
- Aplicar el mismo término a proyectos, skills locales y skills globales.
- Añadir filtros de ámbito (`Todos`, `Global`, `Local`), agente y estado.

### Hallazgos P2

#### 10. Editar una skill necesita tres niveles claros

**Edición manual externa — fácil, recomendada para la primera entrega**

- Abrir `SKILL.md` en la aplicación predeterminada.
- Mostrar la carpeta en Finder/Explorer.
- Copiar la ruta.

**Edición dentro de Skill Control — dificultad media**

- Editor de `SKILL.md` con diff, validación de frontmatter, guardado atómico y copia de seguridad.
- Control de concurrencia por hash para no sobrescribir cambios externos.
- Reescaneo inmediato después de guardar.

**Editar con Codex o Claude — dificultad media/alta**

No existe un contrato único y estable entre plataformas para abrir cualquiera de los dos productos con carpeta, archivo y prompt precargados. La primera versión debe ofrecer:

- `Copiar instrucciones para Codex`.
- `Copiar instrucciones para Claude`.
- `Abrir carpeta`.

La ejecución directa se añadirá después mediante adaptadores detectables por capacidad (CLI instalada, versión compatible y consentimiento explícito), sin convertirla en dependencia del flujo básico.

#### 11. “Cuarentena” y “desinstalación” son conceptos distintos

El backend puede reutilizar el mismo archivo reversible, pero el producto debe registrar la intención:

- **Desinstalada**: decisión del usuario por relevancia o limpieza.
- **En cuarentena**: retirada recomendada por un riesgo o bloqueo.

Esto mejora el copy, el historial y las acciones de restauración.

## Especificación del flujo recomendado

### Pantalla principal: Inventario

Orden recomendado:

1. Banner de excepciones globales, solo si existen.
2. Contadores de inventario.
3. Workspaces/proyectos añadidos, con jerarquía y contadores.
4. Skills globales con acciones rápidas.

La fusión de “Resumen” y “Proyectos” en una única pantalla **Inventario** debe evaluarse después de corregir P0. Hoy ambas superficies compiten por ser la entrada principal.

### Modal Mover a proyecto

Campos:

1. Skill e instalación de origen.
2. Proyecto o ámbito de destino, mostrado con jerarquía.
3. Agente afectado.
4. Checkbox activado: `Desinstalar la copia global después de copiar`.
5. Resumen exacto de rutas y reversibilidad.

CTA dinámico:

- Checkbox activo: **Mover al proyecto**.
- Checkbox inactivo: **Copiar al proyecto**.

Resultado:

- Éxito: indicar destino, retirada global y opción de deshacer.
- Copia creada pero origen no retirado: estado parcial explícito y acción para resolver.
- Conflicto en destino: no sobrescribir; ofrecer inspeccionar la copia existente.

### Desinstalar

El primer nivel debe llamarse **Desinstalar…** y abrir confirmación:

- Qué copia exacta se retira.
- Qué agente y ámbito deja de verla.
- Que se conserva un archivo reversible.
- CTA: **Desinstalar skill**.
- Confirmación posterior con **Deshacer**.

La eliminación permanente del archivo queda fuera del flujo principal y vive en el historial/archivo.

## Plan CTO

### Fase 0 — correcciones críticas de UX (1–2 días)

Frontend:

- Acotar los estilos de `.icon-button` y restaurar posición/tamaño en listas.
- Sustituir símbolos ambiguos por acciones con texto y un menú de overflow coherente.
- Hacer clicable toda la tarjeta de proyecto con foco accesible.
- Hacer clicables los nombres de skills.
- Limpiar `selectedProjectPath` al navegar a Proyectos.
- Corregir búsqueda contextual y filtrado de globales.
- Añadir traducciones en todos los idiomas soportados.

Pruebas:

- Test de navegación desde cualquier zona de la tarjeta.
- Test de nombre de skill → inspector.
- Test de Proyectos desde detalle → listado.
- Test de que cada fila local/global contiene una acción visible de desinstalación.
- Test de teclado y foco para tarjeta, nombre y modal.

Criterio de salida:

- Un usuario puede abrir un proyecto, inspeccionar y desinstalar una copia sin conocer el símbolo `⊘` ni el concepto “cuarentena”.

### Fase 1 — ciclo de vida global → local (3–5 días)

Backend Rust:

- Crear un comando `move_skill_to_project` con modo `copy` o `move`.
- Validar instalación, agente, ámbito, destino y hash esperado.
- Copiar de forma atómica y comprobar que el hash del destino coincide.
- En modo move, archivar la fuente solo después de verificar la copia.
- Si falla el archivo o su persistencia en SQLite, revertir la operación cuando sea seguro.
- Registrar `operation_id`, `reason`, `source_scope`, `destination_path` y hash.
- Mantener restauración sin sobrescritura.

Frontend:

- Añadir checkbox de retirada global activado por defecto.
- Mostrar plan exacto y estado parcial.
- Mostrar toast con deshacer.
- Renombrar el flujo general a Desinstalar y reservar Cuarentena para seguridad.

Pruebas Rust:

- Copy mantiene el origen.
- Move crea destino y archiva origen.
- Conflicto de destino no modifica el origen.
- Hash distinto cancela la retirada.
- Fallo al registrar archivo revierte el movimiento.
- Restaurar no sobrescribe.
- Operación sobre una copia no afecta a otra del mismo nombre.

Criterio de salida:

- Una skill global puede pasar a un proyecto en una sola operación reversible y sin estado ambiguo.

### Fase 2 — jerarquía de workspaces y ámbitos (4–6 días)

Modelo propuesto:

```ts
type WorkspaceNode = {
  id: string
  path: string
  name: string
  kind: 'workspace' | 'repository' | 'package' | 'scope'
  parentId?: string
  workspaceRootId: string
  relativePath: string
  explicitlyAdded: boolean
  agents: Agent[]
}
```

Backend:

- Separar roots añadidos explícitamente de nodos detectados.
- Calcular para cada nodo el ancestro detectado más cercano.
- Conservar todos los ámbitos como destinos válidos sin convertirlos en tarjetas raíz.
- Deduplicar roots solapados y devolver la relación padre/hijo.
- Migrar `ProjectSummary` o añadir `workspaceNodes` manteniendo compatibilidad temporal.

Frontend:

- Mostrar solo roots explícitos/repositorios principales como tarjetas.
- Añadir árbol de ámbitos en el detalle.
- Mostrar rutas relativas (`src-tauri`) y breadcrumb completo al enfocar.
- Usar selector jerárquico en instalación y movimiento.

Pruebas:

- Repo con paquete anidado.
- Ámbito de skills anidado sin `package.json`.
- Root y subcarpeta añadidos explícitamente.
- Monorepo con varios paquetes hermanos.
- Dos proyectos con el mismo nombre y distinta ruta.
- Symlinks y carpetas ignoradas.

Criterio de salida:

- `SkillsControl/src-tauri` aparece dentro de `SkillsControl`, pero sigue siendo elegible como destino.

### Fase 3 — edición externa segura (2–3 días)

- Añadir plugin/servicio de apertura del sistema.
- Exponer comandos que reciban un identificador de instalación y resuelvan rutas en backend.
- Validar que `SKILL.md` pertenece a una instalación reconocida.
- Acciones: **Abrir SKILL.md**, **Mostrar carpeta**, **Copiar ruta**.
- Añadir generadores de prompt para Codex y Claude que no modifiquen archivos ni lancen procesos sin consentimiento.

Criterio de salida:

- El usuario puede pasar de una skill inspeccionada a editar su archivo en un clic y volver a escanear los cambios.

### Fase 4 — editor integrado y adaptadores de IA (opcional, 5–8 días + adaptadores)

- Editor de texto con frontmatter y Markdown.
- Lectura y escritura backend con `expectedHash`.
- Diff antes de guardar, backup y rollback.
- Validación de estructura y reescaneo.
- Detección opcional de CLI de Codex/Claude y adaptadores versionados.
- Confirmación explícita antes de abrir terminal o ejecutar procesos.

Esta fase no debe bloquear la mejora principal de inventario, jerarquía y desinstalación.

## Orden recomendado de entrega

1. Fase 0: elimina la fricción y el bug visible.
2. Fase 1: completa el trabajo principal global → local.
3. Fase 2: corrige el modelo mental de proyecto/subcarpeta.
4. Fase 3: entrega edición manual útil con bajo riesgo.
5. Fase 4: solo después de validar demanda real de edición integrada o handoff directo.

Estimación para un ingeniero familiarizado con React, Tauri y Rust: **2–3 semanas** para Fases 0–3, incluyendo tests, i18n y revisión visual. La integración directa y fiable con Codex/Claude queda fuera de esa estimación.

## Métricas de producto

- Porcentaje de usuarios con skills globales después de siete días.
- Tiempo desde detectar una global hasta moverla o desinstalarla.
- Porcentaje de movimientos completados sin estado parcial.
- Número de instalaciones globales y locales por workspace.
- Restauraciones tras desinstalación, como señal de errores o copy confuso.
- Aperturas de “Editar” y uso de cada destino de edición.

No se medirá contenido de skills ni rutas completas fuera del dispositivo. Si se añade telemetría, será opcional y agregada.

