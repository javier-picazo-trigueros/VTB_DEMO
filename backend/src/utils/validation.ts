/**
 * Una sola política de validación de entrada (SCRUM-21, hallazgos M-3 y M-4
 * de AUDITORIA_SEGURIDAD_3.md).
 *
 * Antes cada ruta validaba a su manera, y el mínimo real de la plataforma era
 * el más débil de todos, no el más fuerte:
 *
 *   registro público          6 caracteres, email con includes("@")
 *   cambio de contraseña      6
 *   registro autenticado      8
 *   reset / invitación        8
 *   alta por administrador    sin mínimo
 *
 * Todas importan ahora de aquí. Si una ruta rechaza un valor, lo rechazan
 * todas — hay un test que lo recorre ruta a ruta
 * (__tests__/validation-policy.test.ts).
 *
 * El frontend repite el mínimo en frontend/src/utils/passwordPolicy.js, para
 * avisar antes de enviar. El mismo test compara las dos constantes: si alguien
 * cambia una sin la otra, falla.
 */
import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Contraseña nueva: la que se elige al registrarse, al cambiarla, al
 * restablecerla o al activar una invitación, y la que pone un administrador.
 *
 * NO sirve para el login: ahí se valida la contraseña que la persona ya tiene,
 * y una cuenta antigua con 6 caracteres tiene que poder entrar para cambiarla.
 */
export const passwordSchema = z
  .string({ error: "La contraseña es obligatoria" })
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`);

/**
 * Email de una cuenta nueva, ya normalizado: sin espacios y en minúsculas.
 *
 * El login busca siempre en minúsculas (routes/auth.ts). Una cuenta guardada
 * como `Juan@uni.edu` no podía entrar nunca, y la base la aceptaba como
 * distinta de `juan@uni.edu` (P1-17 de AUDITORIA_2.md). Normalizar aquí, en
 * el único punto por el que pasan todas las altas, es lo que lo evita.
 */
export const emailSchema = z
  .string({ error: "El email es obligatorio" })
  .trim()
  .toLowerCase()
  .max(254, "El email es demasiado largo")
  .pipe(z.email("Formato de email no válido"));

/** Primer mensaje de error de un safeParse fallido, para responder un 400. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}
