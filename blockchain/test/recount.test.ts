/**
 * El recuento independiente tiene que dar lo mismo que el contrato.
 *
 * scripts/recount.ts es el entregable que sostiene la tesis del proyecto: un
 * tercero recuenta por su cuenta leyendo solo la cadena. Si ese script y el
 * contrato no coinciden, no sirve de nada, así que se comprueba aquí contra una
 * elección real, con votos reales, en la red en proceso de Hardhat.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { recount, formatRecount } from "../scripts/recount";

const CANDIDATES_ROOT = ethers.id("candidatos:ana,bruno,carla");

/** Elección de 3 candidatos con 6 votos: 4 a Ana, 2 a Bruno, 0 a Carla. */
async function eleccionVotadaFixture() {
  const [owner, relayer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("ElectionRegistryV2");
  const registry = await factory.deploy(relayer.address);
  await registry.waitForDeployment();

  const ahora = await time.latest();
  await registry
    .connect(relayer)
    .createElection("Delegado 2026/27", ahora - 60, ahora + 3600, 3, CANDIDATES_ROOT, ethers.ZeroHash);

  const reparto = [0, 0, 0, 0, 1, 1];
  for (let i = 0; i < reparto.length; i++) {
    await registry.connect(relayer).castVote(1, BigInt(ethers.id(`votante-${i}`)), reparto[i]);
  }

  return { registry, address: await registry.getAddress(), owner, relayer };
}

describe("recuento independiente (scripts/recount.ts)", () => {
  it("reconstruye desde los eventos lo mismo que dice el contrato", async () => {
    const { address } = await loadFixture(eleccionVotadaFixture);

    const r = await recount(ethers.provider, address, 1);

    expect(r.tallyFromEvents).to.deep.equal([4, 2, 0]);
    expect(r.tallyFromContract).to.deep.equal([4, 2, 0]);
    expect(r.totalFromEvents).to.equal(6);
    expect(r.totalFromContract).to.equal(6);
    expect(r.repeatedNullifiers).to.equal(0);
    expect(r.consistent).to.equal(true);
  });

  it("encuentra el bloque de partida por su cuenta, sin que se lo den", async () => {
    const { address, registry } = await loadFixture(eleccionVotadaFixture);

    // Sin fromBlock: se lo pregunta al contrato. Es lo que permite que alguien
    // de fuera recuente sabiendo solo la dirección, sin ficheros del proyecto.
    const r = await recount(ethers.provider, address, 1);

    expect(r.fromBlock).to.equal(Number(await registry.deploymentBlock()));
    expect(r.totalFromEvents).to.equal(6);
  });

  it("publica la huella de la lista de candidatos y los datos de la elección", async () => {
    const { address } = await loadFixture(eleccionVotadaFixture);

    const r = await recount(ethers.provider, address, 1);

    // Sin esto, "candidato 0" no significa nada para quien recuenta.
    expect(r.candidatesRoot).to.equal(CANDIDATES_ROOT);
    expect(r.candidateCount).to.equal(3);
    expect(r.name).to.equal("Delegado 2026/27");
    expect(r.halted).to.equal(false);
  });

  it("el informe es legible y dice si cuadra", async () => {
    const { address } = await loadFixture(eleccionVotadaFixture);

    const informe = formatRecount(await recount(ethers.provider, address, 1));

    expect(informe).to.contain("RECUENTO INDEPENDIENTE");
    expect(informe).to.contain(CANDIDATES_ROOT);
    expect(informe).to.contain("las dos fuentes coinciden");
  });

  it("una elección sin votos da cero, no un error", async () => {
    const { address, registry, relayer } = await loadFixture(eleccionVotadaFixture);
    const ahora = await time.latest();
    await registry
      .connect(relayer)
      .createElection("Sin votos", ahora - 60, ahora + 3600, 2, CANDIDATES_ROOT, ethers.ZeroHash);

    const r = await recount(ethers.provider, address, 2);

    expect(r.tallyFromEvents).to.deep.equal([0, 0]);
    expect(r.totalFromContract).to.equal(0);
    expect(r.consistent).to.equal(true);
  });
});
