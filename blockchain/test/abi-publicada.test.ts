/**
 * El ABI que se versiona tiene que seguir siendo el del contrato compilado.
 *
 * `blockchain/abi/*.json` existe para que el backend y sus tests puedan
 * comprobar sus firmas sin depender de `artifacts/`, que no está en git. El
 * riesgo evidente es que alguien toque el contrato y no regenere ese fichero,
 * dejando al test del backend validando contra una foto vieja. Esto lo impide.
 *
 * Si falla, hay que regenerarlo desde el artefacto recién compilado.
 */
import { expect } from "chai";
import { artifacts } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

const PUBLICADOS: Array<[contrato: string, fichero: string]> = [
  ["ElectionRegistry", "ElectionRegistry.json"],
  ["ElectionRegistryV2", "ElectionRegistryV2.json"],
];

describe("ABI publicado en blockchain/abi", () => {
  for (const [contrato, fichero] of PUBLICADOS) {
    it(`${fichero} coincide con ${contrato} compilado`, async () => {
      const compilado = await artifacts.readArtifact(contrato);
      const publicado = JSON.parse(
        readFileSync(join(__dirname, "..", "abi", fichero), "utf8"),
      );

      expect(publicado.contractName).to.equal(contrato);
      expect(publicado.abi).to.deep.equal(
        compilado.abi,
        `blockchain/abi/${fichero} no coincide con el contrato compilado. ` +
        `Regenéralo desde artifacts/ tras cambiar el contrato.`,
      );
    });
  }
});
