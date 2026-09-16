/**
 * Punto de montaje de /admin — junta los routers partidos en SCRUM-13.
 *
 * Antes era un único admin.ts de 1911 líneas y 28 rutas; con dos personas
 * tocándolo a la vez, cada PR chocaba con el anterior. El reparto es por lo
 * que cada ruta gestiona, no por tamaño:
 *
 *   users.ts            — cuentas: alta, importación de censo, aprobación, baja
 *   org.ts              — panorama general: dashboard, unidades, admins de dominio
 *   elections.ts        — una elección: crear, editar, imagen, candidatos, altas sueltas
 *   election-census.ts  — censo masivo, auditoría, estadísticas, avisos por correo
 *
 * Cuatro ficheros de dominio y no los tres que nombraba el ticket original:
 * users+elections solos ya pasaban de 600 líneas (el propio criterio de
 * aceptación), así que election-census.ts se separó de elections.ts por puro
 * tamaño — el corte real ahí es "gestionar la elección" frente a "todo lo que
 * pasa una vez que ya existe".
 *
 * shared.ts lleva lo que de verdad usa más de un fichero (los helpers de
 * alcance por dominio, el multer de subida, el parser de CSV y el alta de
 * usuario del censo) — ver ese fichero para el porqué de cada uno.
 */
import express from "express";
import usersRoutes from "./users.js";
import orgRoutes from "./org.js";
import electionsRoutes from "./elections.js";
import electionCensusRoutes from "./election-census.js";

const router = express.Router();

router.use(usersRoutes);
router.use(orgRoutes);
router.use(electionsRoutes);
router.use(electionCensusRoutes);

export default router;
