/**
 * La huella de la lista de candidatos.
 *
 * Es un compromiso público: al registrar la elección se escribe on-chain el
 * keccak256 de la lista, y la lista se publica con la convocatoria. Quien
 * verifique tiene que poder recalcular ese hash SIN nuestro código, así que el
 * formato exacto es parte del contrato con el exterior y no puede cambiar por
 * accidente. Estos tests lo fijan.
 */
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  listaCanonica,
  serializarLista,
  candidatesRoot,
  ListaDeCandidatosInvalida,
} from '../services/candidatesRoot.js';

describe('lista canónica de candidatos', () => {
  it('ordena por posición, no por el orden en que lleguen', () => {
    const lista = listaCanonica([
      { position: 2, name: 'Carla' },
      { position: 0, name: 'Ana' },
      { position: 1, name: 'Bruno' },
    ]);
    expect(lista.map(c => c.name)).toEqual(['Ana', 'Bruno', 'Carla']);
  });

  it('normaliza el nombre para que una tilde no cambie el hash', () => {
    // Dos representaciones Unicode de "Sáez": precompuesta y descompuesta.
    const precompuesta = 'Sáez';
    const descompuesta = 'Sáez';
    expect(precompuesta).not.toBe(descompuesta);

    expect(candidatesRoot([{ position: 0, name: precompuesta }]))
      .toBe(candidatesRoot([{ position: 0, name: descompuesta }]));
  });

  it('ignora los espacios de los extremos', () => {
    expect(candidatesRoot([{ position: 0, name: '  Ana  ' }]))
      .toBe(candidatesRoot([{ position: 0, name: 'Ana' }]));
  });

  it('la descripción no entra en la huella', () => {
    // Es texto editable: cambiarlo no cambia quién es el candidato, y si
    // entrara, editar una descripción invalidaría el compromiso de la elección.
    const conUnaDescripcion = [{ position: 0, name: 'Ana', description: 'Lista A' }];
    const conOtra = [{ position: 0, name: 'Ana', description: 'otra cosa' }];
    expect(candidatesRoot(conUnaDescripcion)).toBe(candidatesRoot(conOtra));
  });

  it('el formato serializado es exactamente el documentado', () => {
    // Si esto cambia, cualquiera que hubiera verificado una elección anterior
    // deja de poder reproducir el hash. Es el formato que se publica.
    const serializada = serializarLista(listaCanonica([
      { position: 1, name: 'Bruno Sáez' },
      { position: 0, name: 'Ana Ruiz' },
    ]));
    expect(serializada).toBe('[{"position":0,"name":"Ana Ruiz"},{"position":1,"name":"Bruno Sáez"}]');
  });

  it('la huella es keccak256 de esa cadena, sin nada más', () => {
    const candidatos = [{ position: 0, name: 'Ana Ruiz' }, { position: 1, name: 'Bruno Sáez' }];
    const esperado = ethers.keccak256(
      ethers.toUtf8Bytes('[{"position":0,"name":"Ana Ruiz"},{"position":1,"name":"Bruno Sáez"}]'),
    );
    expect(candidatesRoot(candidatos)).toBe(esperado);
  });

  it('cambiar un solo nombre cambia la huella', () => {
    const antes = candidatesRoot([{ position: 0, name: 'Ana' }, { position: 1, name: 'Bruno' }]);
    const despues = candidatesRoot([{ position: 0, name: 'Ana' }, { position: 1, name: 'Bruna' }]);
    expect(antes).not.toBe(despues);
  });

  it('reordenar a los candidatos cambia la huella', () => {
    // Tiene que cambiar: la posición es el identificador en la cadena, así que
    // intercambiarlos cambia a quién corresponde cada voto ya emitido.
    const antes = candidatesRoot([{ position: 0, name: 'Ana' }, { position: 1, name: 'Bruno' }]);
    const despues = candidatesRoot([{ position: 0, name: 'Bruno' }, { position: 1, name: 'Ana' }]);
    expect(antes).not.toBe(despues);
  });
});

describe('listas que no se pueden registrar en la cadena', () => {
  it('sin candidatos', () => {
    expect(() => candidatesRoot([])).toThrow(ListaDeCandidatosInvalida);
  });

  it('con un hueco en las posiciones', () => {
    // El contrato rechaza cualquier candidateId >= candidateCount: con
    // posiciones {0, 5} y dos candidatos, el voto al 5 revertiría en cadena.
    expect(() => candidatesRoot([{ position: 0, name: 'Ana' }, { position: 5, name: 'Bruno' }]))
      .toThrow(/0\.\.1 sin huecos/);
  });

  it('con posiciones repetidas', () => {
    expect(() => candidatesRoot([{ position: 0, name: 'Ana' }, { position: 0, name: 'Bruno' }]))
      .toThrow(ListaDeCandidatosInvalida);
  });

  it('que no empieza en 0', () => {
    expect(() => candidatesRoot([{ position: 1, name: 'Ana' }]))
      .toThrow(ListaDeCandidatosInvalida);
  });

  it('con un candidato sin nombre', () => {
    expect(() => candidatesRoot([{ position: 0, name: '   ' }]))
      .toThrow(/no tiene nombre/);
  });
});
