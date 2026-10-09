/**
 * Una sola versión de Node en todo el repo (24). Había 20 en los ficheros
 * .node-version, 22 en el Dockerfile del backend, en el compose y en la CI, y 24
 * en el frontend: un fallo que solo ocurre en una de esas versiones no se ve en
 * las otras. El .nvmrc del frontend estaba además en UTF-16, que nvm no lee.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf-8');

describe('Node 24 en todo el repo', () => {
  for (const file of ['backend/.node-version', 'frontend/.node-version', 'frontend/.nvmrc']) {
    it(`${file} es "24" en UTF-8 sin BOM`, () => {
      const bytes = readFileSync(path.join(root, file));
      expect(bytes.includes(0), 'tiene bytes nulos: está en UTF-16').toBe(false);
      expect(bytes[0]).not.toBe(0xef); // BOM de UTF-8
      expect(bytes.toString('utf-8').trim()).toBe('24');
    });
  }

  it('los dos package.json declaran engines.node = 24.x', () => {
    for (const file of ['backend/package.json', 'frontend/package.json']) {
      expect(JSON.parse(read(file)).engines?.node, file).toBe('24.x');
    }
  });

  it('los Dockerfiles y el compose usan node:24-alpine y ninguna otra versión', () => {
    for (const file of ['backend/Dockerfile', 'frontend/Dockerfile', 'docker-compose.yml']) {
      const images = [...read(file).matchAll(/node:(\d+)[\w.-]*/g)].map((m) => m[1]);
      expect(images.length, `${file} no usa ninguna imagen de node`).toBeGreaterThan(0);
      expect(new Set(images), file).toEqual(new Set(['24']));
    }
  });

  it('la CI prueba backend y frontend solo con Node 24', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/node: \["24"\]/);
    const versions = [...ci.matchAll(/node-version: ["']?([^"'\s$]+)["']?/g)].map((m) => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) expect(version).toMatch(/^24$|^\$\{\{ matrix\.node \}\}$/);
  });
});
