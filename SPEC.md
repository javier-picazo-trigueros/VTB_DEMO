# SPEC — VTB Ronda 1

Contexto global (aplica a TODAS las tareas):

VTB es una plataforma de votación institucional. React 18 + Vite en
Vercel, Express + TypeScript en Render, PostgreSQL, Solidity 0.8.24 en
Ethereum Sepolia. Objetivo de esta ronda: que deje de parecer un
proyecto universitario para poder enseñarlo a empresas.

YA HECHO, no rehacer: migración a PostgreSQL completa, cookies httpOnly
con CSRF, servicio de email con Resend, 37 tests pasando, ESLint,
Prettier y CI con escaneo de secretos.

PROHIBIDO en todas las tareas: tocar la lógica de autenticación o el
flujo de voto, tocar los contratos Solidity, cambiar rutas públicas de
la API, e introducir cualquier afirmación de que el voto es anónimo (el
backend conoce hoy la correspondencia votante-voto). Los 37 tests deben
seguir pasando y el build debe quedar limpio.

---

## Eliminar archivos basura del repositorio

Borrar el fichero `$null` de la raíz, los scripts ad-hoc (`fix_*.cjs`,
`fix_*.py`, `remove_console_logs.js`), restos de pruebas y carpetas
duplicadas. Verificar que `.venv`, `node_modules`, `.env` y
`AUDITORIA.md` están correctamente ignorados en `.gitignore`.
Sustituir el favicon de Vite (`/vite.svg` en index.html) por uno propio.

Antes de borrar nada, listar lo encontrado y esperar aprobación humana.

## Detectar y eliminar codigo muerto

Buscar y eliminar: componentes de frontend que no importa ningún
archivo, rutas de backend sin uso, funciones sin referencias, imports
sin usar, claves de i18n sin usar, dependencias declaradas en
package.json que no aparecen en el código, y columnas o tablas del
esquema que ningún código consulta.

Listar los hallazgos antes de borrar y esperar aprobación humana.

## Unificar idioma de mensajes de error de la API

Los mensajes de error del backend mezclan español e inglés. Elegir un
solo idioma y aplicarlo a todos los endpoints. Unificar también el
idioma de los comentarios del código.

## Unificar la forma de las respuestas de la API

Hoy unos endpoints devuelven `{success, data}` y otros el objeto pelado.
Elegir una forma y aplicarla a todos los endpoints, sin cambiar las
rutas ni los códigos de estado HTTP. Actualizar el frontend para que
consuma la forma nueva. Los tests deben seguir pasando.

## Sustituir console.log por un logger con niveles

Reemplazar los `console.log` del backend por un logger mínimo con
niveles (debug, info, warn, error) que en producción no imprima nada
por debajo de warn. Revisar que ningún log imprima datos personales,
claves ni valores sensibles.

## Reducir los tipos any del backend

Eliminar los `any` restantes empezando por los resultados de consultas
a base de datos y por el manejo de tokens. Definir interfaces para las
filas de las tablas principales. El typecheck debe quedar limpio.

## Partir admin.ts en sub-routers

El fichero `backend/src/routes/admin.ts` es demasiado grande. Partirlo
en sub-routers separados (dashboard, users, elections, requests) con un
index que los monte. NINGUNA ruta pública puede cambiar de path, método
ni respuesta. Proponer la estructura y esperar aprobación humana antes
de mover código.

## Proponer una direccion visual profesional sin aplicarla

NO escribir código en esta tarea. Solo producir una propuesta.

La interfaz delata que es un proyecto generado sin criterio de diseño:
degradados en textos de título, emojis como iconos, esquinas muy
redondeadas, sombras difusas grandes, densidad de información demasiado
baja, tipografía del sistema sin jerarquía real, y animaciones de
entrada innecesarias.

Producir una propuesta que incluya: dos o tres productos reales de
referencia (herramientas institucionales o financieras, no SaaS de
consumo) y qué se les copia; una tipografía propia con su escala
completa y pesos; un color de marca con justificación; y un plan para
aumentar la densidad de información en dashboard y panel de
administración usando tablas donde tenga sentido.

Entregar la propuesta como una página HTML abrible que maquete el
dashboard del votante, la pantalla de voto y el panel de
administración en el estilo nuevo.

Esperar aprobación humana antes de que ninguna otra tarea aplique
estilos.

## Aplicar la direccion visual a los estilos base

Depende de que la dirección visual esté aprobada.

Aplicar los tokens de color, la tipografía y la escala al
`tailwind.config.js` y al `index.css`. Actualizar los componentes
compartidos: botones, campos de formulario, tarjetas, tablas y badges.
Eliminar emojis usados como iconos y degradados en textos.

## Aplicar el diseno a las pantallas de la aplicacion

Depende de que los estilos base estén aplicados.

Aplicar el diseño, una pantalla por vez y con build entre cada una, en
este orden: Login, Dashboard del votante, pantalla de voto, panel de
administración, resultados. Aumentar la densidad de información según
lo aprobado. Añadir estados de carga con skeleton, estado vacío con
guía de primer uso, y estados de error con acción concreta. Comprobar
que todo funciona en un móvil de 320 píxeles. No cambiar la estructura
de navegación ni los flujos.

No tocar la landing ni la página de precios en esta ronda.

## Sustituir los datos de demostracion por datos verosimiles

Los datos de demo actuales tienen nombres como "Demo Super Admin" y
"Test Election", lo que delata el proyecto en cualquier demostración.
Sustituirlos por una universidad ficticia con nombre creíble, procesos
electorales con nombres realistas y candidatos con nombres normales.
Mantener las contraseñas de demo documentadas.
