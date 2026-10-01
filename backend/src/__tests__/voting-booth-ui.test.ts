/**
 * Cabina de votación: regresiones de interfaz que ya se vieron en producción.
 *
 * No hay tests de componentes en el frontend, así que estos leen el código de
 * VotingBooth.jsx y de las traducciones, igual que frontend-api-base.test.ts.
 * Cada caso nombra el fallo que impide que vuelva.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '../../../frontend/src');
const booth = readFileSync(path.join(src, 'pages/VotingBooth.jsx'), 'utf-8');
const i18n = readFileSync(path.join(src, 'i18n/config.ts'), 'utf-8');

/** El bloque JSX de la lista de candidatos. */
const inicio = booth.indexOf('candidates.map((candidate)');
const lista = booth.slice(inicio, booth.indexOf('setShowConfirm(true)', inicio));

describe('el nombre del candidato se ve en modo oscuro', () => {
  // La tarjeta es dark:bg-slate-800 y el nombre era text-slate-800, sin variante
  // oscura: texto rgb(30,41,59) sobre fondo rgb(30,41,59), invisible.
  it('el nombre tiene color en claro y variante dark: en seleccionado y sin seleccionar', () => {
    const nombre = lista.slice(lista.indexOf('{candidate.name}') - 400, lista.indexOf('{candidate.name}'));
    expect(nombre).toMatch(/text-slate-900 dark:text-white/);
    expect(nombre).toMatch(/text-brand-700 dark:text-brand-100/);
    expect(nombre).not.toMatch(/text-slate-800/);
  });

  it('la descripción y el radio también tienen variante dark:', () => {
    expect(lista).toMatch(/text-slate-500 dark:text-slate-400[^"]*truncate/);
    expect(lista).toMatch(/border-slate-300 dark:border-slate-500/);
  });

  it('la fila seleccionada y el hover tienen fondo propio en oscuro', () => {
    expect(lista).toMatch(/dark:bg-brand-600\/25/);
    expect(lista).toMatch(/dark:hover:bg-slate-700\/50/);
  });
});

describe('"votantes registrados" sale del censo', () => {
  // Era un useState(0) que solo subía con eventos VoteCast recibidos en vivo: 0
  // al abrir la página, mientras "0 de 3 votantes" (del censo) salía bien.
  it('no hay un contador local de eventos: se lee participation.totalVoters', () => {
    expect(booth).not.toMatch(/voteCount|setVoteCount/);
    const i = booth.indexOf('votingBooth.votersRegistered');
    const tarjeta = booth.slice(i - 900, i);
    expect(tarjeta).toMatch(/participation \? participation\.totalVoters/);
  });

  it('el número de la tarjeta y el "N de M" salen del mismo campo de /results', () => {
    expect(booth).toMatch(/totalVoters: Number\(data\.election\?\.totalVoters\)/);
    expect(booth).toMatch(/total: participation\.totalVoters/);
  });
});
