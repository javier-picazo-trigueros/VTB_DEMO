/**
 * Tutorial de bienvenida (react-joyride).
 *
 * Dos fallos reales:
 *  - Administración: "create-election" estaba en el formulario de crear usuarios
 *    (pestaña "users"), que no existe al abrir /admin. Al faltar el objetivo del
 *    paso 2 el tutorial se cerraba tras el primer paso.
 *  - react-joyride pasó a la 3.x, que ignora en silencio `callback`,
 *    `showProgress`, `showSkipButton`, `disableBeacon` y `styles.options`: sin
 *    botón de saltar, sin progreso, sin colores y sin enterarse de que acabó.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '../../../frontend/src');
// sin comentarios de línea: explican justamente lo que se prohíbe aquí
const tour = readFileSync(path.join(src, 'components/OnboardingTour.jsx'), 'utf-8').replace(/\/\/.*$/gm, '');
const admin = readFileSync(path.join(src, 'pages/AdminPanel.jsx'), 'utf-8');
const joyrideVersion = JSON.parse(
  readFileSync(path.join(src, '../node_modules/react-joyride/package.json'), 'utf-8'),
).version as string;

describe('el tutorial usa la API de react-joyride 3.x', () => {
  it('la versión instalada es la 3.x (si cambia, hay que revisar este fichero)', () => {
    expect(joyrideVersion).toMatch(/^3\./);
  });

  it('usa onEvent y options, y ya no callback ni las props sueltas de la 2.x', () => {
    expect(tour).toMatch(/onEvent=\{handleEvent\}/);
    expect(tour).toMatch(/options=\{\{/);
    expect(tour).toMatch(/showProgress: true/);
    expect(tour).toMatch(/buttons: \['back', 'skip', 'primary'\]/);
    expect(tour).not.toMatch(/callback=/);
    expect(tour).not.toMatch(/showSkipButton/);
    expect(tour).not.toMatch(/disableBeacon/);
    expect(tour).not.toMatch(/styles=\{\{\s*options/);
  });
});

describe('los objetivos del tutorial existen siempre', () => {
  const objetivos = [...tour.matchAll(/data-tour="([a-z-]+)"/g)].map((m) => m[1]);
  const deAdmin = ['create-election', 'requests-tab', 'stats-tab'];

  it('el tutorial de administración apunta a los tres objetivos esperados', () => {
    for (const o of deAdmin) expect(objetivos).toContain(o);
  });

  it('los tres son botones de pestaña (TabButton), siempre en pantalla', () => {
    const tab = admin.slice(admin.indexOf('function TabButton'), admin.indexOf('function TabButton') + 900);
    expect(tab).toMatch(/id === "inbox" \? "requests-tab"/);
    expect(tab).toMatch(/id === "stats" \? "stats-tab"/);
    expect(tab).toMatch(/id === "elections" \? "create-election"/);
  });

  it('create-election no está en ningún otro sitio (el formulario de usuarios no es el objetivo)', () => {
    expect((admin.match(/data-tour="create-election"/g) ?? []).length).toBe(0);
  });
});

describe('textos del tutorial en español', () => {
  const i18n = readFileSync(path.join(src, 'i18n/config.ts'), 'utf-8');

  it('llevan tilde y el botón con progreso está traducido', () => {
    expect(i18n).toMatch(/nextWithProgress: "Siguiente \(\{current\} de \{total\}\)"/);
    expect(i18n).toMatch(/nextWithProgress: "Next \(\{current\} of \{total\}\)"/);
    expect(i18n).not.toMatch(/auditoria publica blockchain|panel de administracion de VTB|Aqui aparecen/);
  });
});
