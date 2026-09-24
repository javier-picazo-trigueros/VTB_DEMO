/**
 * Mínimo de caracteres de una contraseña nueva (SCRUM-21).
 *
 * Es una copia de PASSWORD_MIN_LENGTH en backend/src/utils/validation.ts, que
 * es quien de verdad decide: el servidor rechaza cualquier cosa más corta
 * venga de donde venga. Aquí solo sirve para avisar antes de enviar.
 *
 * backend/src/__tests__/validation-policy.test.ts compara las dos constantes:
 * si se cambia una sin la otra, el test falla.
 *
 * Antes cada formulario tenía su propio número (6 en el registro, el perfil y
 * el cambio de contraseña; 8 en el restablecimiento), y el mínimo real de la
 * plataforma era el más débil de todos.
 */
export const PASSWORD_MIN_LENGTH = 8
