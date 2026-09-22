/**
 * Test para Punto 18:
 * 1. Comprueba que en ElectionResults.jsx, cuando election.status === 'active',
 *    la interfaz no muestra el desglose ni gráficos de reparto por candidato,
 *    sino únicamente los datos de participación.
 * 2. Comprueba que SEGURIDAD.md aclara explícitamente que ocultar el reparto
 *    en la interfaz no oculta el escrutinio, pues sigue en la cadena y cualquiera puede leerlo.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Punto 18: Ocultación del reparto en la interfaz durante elección activa y aclaración en SEGURIDAD.md', () => {
  const resultsJsxPath = path.resolve(__dirname, '../../../frontend/src/pages/ElectionResults.jsx');
  const seguridadMdPath = path.resolve(__dirname, '../../../SEGURIDAD.md');

  const resultsContent = fs.readFileSync(resultsJsxPath, 'utf8');
  const seguridadContent = fs.readFileSync(seguridadMdPath, 'utf8');

  it('ElectionResults.jsx condiciona el reparto de votos a que la elección no esté activa (solo participación si activa)', () => {
    // Debe haber comprobación de election?.status !== 'active' o election?.status === 'closed'
    // para mostrar los gráficos y el desglose de candidatos por votos
    expect(resultsContent).toMatch(/status\s*===\s*['"]active['"][\s\S]*?(no\s*se\s*muestra|ocult|activeNotice|participación)/i);
    expect(resultsContent).toMatch(/status\s*!==\s*['"]active['"]|status\s*===\s*['"]closed['"]/i);
  });

  it('SEGURIDAD.md aclara que ocultar el reparto en la interfaz NO oculta el escrutinio de la cadena', () => {
    expect(seguridadContent).toMatch(/no oculta el escrutinio/i);
    expect(seguridadContent).toMatch(/está en la cadena y cualquiera puede leerlo|cualquiera puede leerlo/i);
  });
});
