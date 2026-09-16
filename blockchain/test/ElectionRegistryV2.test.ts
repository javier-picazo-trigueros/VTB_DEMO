/**
 * Tests de ElectionRegistryV2.
 *
 * El contrato anterior no tenía ninguno (BC-09). Estos cubren lo que un
 * tribunal preguntaría y lo que la auditoría encontró roto:
 *
 *   - que un tercero pueda recontar y que el recuento cuadre;
 *   - que solo un relayer autorizado pueda escribir votos (BC-01);
 *   - que la ventana temporal se valide en la cadena y sea la real (BC-07);
 *   - que el owner no pueda alterar el recuento ni cerrar en curso (BC-06);
 *   - que la propiedad y los relayers se puedan rotar (BC-13, BC-05);
 *   - que la firma del evento no cambie sin que salte un test (BC-29 fue
 *     exactamente esto: un ABI desincronizado que nadie detectó).
 *
 * Corren sobre la red en proceso de Hardhat: no tocan Sepolia.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const CANDIDATES_ROOT = ethers.id("candidatos:ana,bruno,carla");
const CENSUS_ROOT = ethers.ZeroHash; // reservado para Semaphore
const REASON = ethers.id("motivo documentado fuera de la cadena");

const nullifierOf = (s: string) => BigInt(ethers.id(s));

async function deployFixture() {
  const [owner, relayer, outsider, newOwner] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("ElectionRegistryV2");
  const registry = await factory.deploy(relayer.address);
  await registry.waitForDeployment();
  return { registry, owner, relayer, outsider, newOwner };
}

/** Elección abierta ahora mismo, con `candidateCount` candidatos. */
async function openElection(
  registry: any,
  relayer: any,
  candidateCount = 3,
): Promise<number> {
  const now = await time.latest();
  const tx = await registry
    .connect(relayer)
    .createElection("Elección de prueba", now - 60, now + 3600, candidateCount, CANDIDATES_ROOT, CENSUS_ROOT);
  const receipt = await tx.wait();
  const log = receipt!.logs.find(
    (l: any) => registry.interface.parseLog(l)?.name === "ElectionCreated",
  );
  return Number(registry.interface.parseLog(log).args.electionId);
}

describe("ElectionRegistryV2", () => {
  describe("despliegue", () => {
    it("el que despliega es el owner y el relayer inicial queda autorizado", async () => {
      const { registry, owner, relayer, outsider } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.isRelayer(relayer.address)).to.equal(true);
      // El owner NO es relayer por defecto: la clave fría no firma votos (BC-05).
      expect(await registry.isRelayer(owner.address)).to.equal(false);
      expect(await registry.isRelayer(outsider.address)).to.equal(false);
    });

    it("guarda el bloque de despliegue para quien recuente desde fuera", async () => {
      const { registry } = await loadFixture(deployFixture);
      const deployBlock = await registry.deploymentBlock();
      expect(deployBlock).to.be.greaterThan(0n);
      expect(deployBlock).to.be.lessThanOrEqual(BigInt(await ethers.provider.getBlockNumber()));
    });
  });

  describe("crear elección", () => {
    it("solo un relayer autorizado puede crearla — ni siquiera el owner", async () => {
      const { registry, owner, outsider } = await loadFixture(deployFixture);
      const now = await time.latest();
      const args = ["X", now, now + 3600, 2, CANDIDATES_ROOT, CENSUS_ROOT] as const;

      await expect(registry.connect(outsider).createElection(...args))
        .to.be.revertedWith("ERR: not authorized relayer");
      await expect(registry.connect(owner).createElection(...args))
        .to.be.revertedWith("ERR: not authorized relayer");
    });

    it("el id sale del evento y avanza de uno en uno", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      expect(await openElection(registry, relayer)).to.equal(1);
      expect(await openElection(registry, relayer)).to.equal(2);
      expect(await registry.getElectionCount()).to.equal(2n);
    });

    it("admite una elección que ya ha empezado (BC-07)", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const now = await time.latest();
      // El contrato anterior exigía startTime >= block.timestamp, lo que
      // obligaba al backend a empujar el inicio 120 s y dejaba una ventana
      // ciega en la que la base decía "activa" y la cadena rechazaba.
      await expect(
        registry.connect(relayer).createElection("Ya empezada", now - 7200, now + 3600, 2, CANDIDATES_ROOT, CENSUS_ROOT),
      ).to.emit(registry, "ElectionCreated");

      await expect(registry.connect(relayer).castVote(1, nullifierOf("a"), 0))
        .to.emit(registry, "VoteCast");
    });

    it("rechaza ventanas imposibles y metadatos inválidos", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const now = await time.latest();
      const r = registry.connect(relayer);

      await expect(r.createElection("X", now + 3600, now + 60, 2, CANDIDATES_ROOT, CENSUS_ROOT))
        .to.be.revertedWith("ERR: end must be after start");
      await expect(r.createElection("X", now - 7200, now - 3600, 2, CANDIDATES_ROOT, CENSUS_ROOT))
        .to.be.revertedWith("ERR: end must be in the future");
      await expect(r.createElection("", now, now + 3600, 2, CANDIDATES_ROOT, CENSUS_ROOT))
        .to.be.revertedWith("ERR: invalid name length");
      await expect(r.createElection("X", now, now + 3600, 0, CANDIDATES_ROOT, CENSUS_ROOT))
        .to.be.revertedWith("ERR: invalid candidate count");
      await expect(r.createElection("X", now, now + 3600, 65, CANDIDATES_ROOT, CENSUS_ROOT))
        .to.be.revertedWith("ERR: invalid candidate count");
      await expect(r.createElection("X", now, now + 3600, 2, ethers.ZeroHash, CENSUS_ROOT))
        .to.be.revertedWith("ERR: candidatesRoot cannot be zero");
    });

    it("guarda la ventana real, el compromiso de candidatos y el censo reservado", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const now = await time.latest();
      await registry
        .connect(relayer)
        .createElection("Delegado 2026/27", now - 60, now + 3600, 3, CANDIDATES_ROOT, CENSUS_ROOT);

      const e = await registry.getElection(1);
      expect(e.name).to.equal("Delegado 2026/27");
      expect(e.startTime).to.equal(BigInt(now - 60));
      expect(e.endTime).to.equal(BigInt(now + 3600));
      expect(e.candidateCount).to.equal(3n);
      expect(e.candidatesRoot).to.equal(CANDIDATES_ROOT);
      expect(e.censusRoot).to.equal(CENSUS_ROOT);
      expect(e.halted).to.equal(false);
      expect(e.totalVotes).to.equal(0n);
    });

    it("una elección inexistente no se puede leer ni votar", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      await expect(registry.getElection(1)).to.be.revertedWith("ERR: election does not exist");
      await expect(registry.connect(relayer).castVote(99, nullifierOf("a"), 0))
        .to.be.revertedWith("ERR: election does not exist");
    });
  });

  describe("votar", () => {
    it("BC-01: una dirección cualquiera no puede inflar el recuento", async () => {
      const { registry, relayer, outsider, owner } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer);

      await expect(registry.connect(outsider).castVote(id, nullifierOf("intruso"), 0))
        .to.be.revertedWith("ERR: not authorized relayer");
      await expect(registry.connect(owner).castVote(id, nullifierOf("owner"), 0))
        .to.be.revertedWith("ERR: not authorized relayer");

      expect(await registry.getTotalVotes(id)).to.equal(0n);
    });

    it("el mismo nullifier no puede votar dos veces", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer);
      const n = nullifierOf("votante-1");

      await registry.connect(relayer).castVote(id, n, 0);
      // El backend reconoce este texto por subcadena para devolver 409.
      await expect(registry.connect(relayer).castVote(id, n, 1))
        .to.be.revertedWith("ERR: nullifier already used (double-vote prevented)");

      expect(await registry.getTotalVotes(id)).to.equal(1n);
      expect(await registry.votesFor(id, 1)).to.equal(0n);
    });

    it("el mismo nullifier sí puede votar en elecciones distintas", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const a = await openElection(registry, relayer);
      const b = await openElection(registry, relayer);
      const n = nullifierOf("votante-1");

      await registry.connect(relayer).castVote(a, n, 0);
      await expect(registry.connect(relayer).castVote(b, n, 0)).to.emit(registry, "VoteCast");
    });

    it("rechaza el nullifier cero y los candidatos fuera de rango", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer, 3);

      await expect(registry.connect(relayer).castVote(id, 0, 0))
        .to.be.revertedWith("ERR: nullifier cannot be zero");
      await expect(registry.connect(relayer).castVote(id, nullifierOf("a"), 3))
        .to.be.revertedWith("ERR: candidate out of range");
      // El candidato 0 es un candidato normal, no un hueco.
      await expect(registry.connect(relayer).castVote(id, nullifierOf("a"), 0))
        .to.emit(registry, "VoteCast");
    });

    it("la ventana temporal se valida en la cadena, no en el backend", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const now = await time.latest();
      await registry
        .connect(relayer)
        .createElection("Futura", now + 1000, now + 5000, 2, CANDIDATES_ROOT, CENSUS_ROOT);

      await expect(registry.connect(relayer).castVote(1, nullifierOf("pronto"), 0))
        .to.be.revertedWith("ERR: election has not started");

      await time.increaseTo(now + 1001);
      await expect(registry.connect(relayer).castVote(1, nullifierOf("a tiempo"), 0))
        .to.emit(registry, "VoteCast");

      await time.increaseTo(now + 5001);
      await expect(registry.connect(relayer).castVote(1, nullifierOf("tarde"), 0))
        .to.be.revertedWith("ERR: election out of time window");
    });
  });

  describe("recuento verificable", () => {
    it("getTally cuadra con los votos emitidos y su suma es el total", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer, 3);

      // 4 votos al candidato 0, 2 al 1, ninguno al 2.
      const reparto = [0, 0, 0, 0, 1, 1];
      for (let i = 0; i < reparto.length; i++) {
        await registry.connect(relayer).castVote(id, nullifierOf(`v${i}`), reparto[i]);
      }

      const tally = await registry.getTally(id);
      expect(tally.map(Number)).to.deep.equal([4, 2, 0]);
      expect(await registry.votesFor(id, 0)).to.equal(4n);
      expect(await registry.getTotalVotes(id)).to.equal(6n);
      expect(tally.reduce((a: bigint, b: bigint) => a + b, 0n)).to.equal(
        await registry.getTotalVotes(id),
      );
    });

    it("el recuento se puede reconstruir solo con los eventos", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer, 3);
      for (const [i, c] of [0, 2, 2].entries()) {
        await registry.connect(relayer).castVote(id, nullifierOf(`e${i}`), c);
      }

      // Lo mismo que hará scripts/recount.ts desde fuera, sin la aplicación.
      const logs = await registry.queryFilter(registry.filters.VoteCast(id), 0, "latest");
      const desdeEventos = [0, 0, 0];
      for (const l of logs) desdeEventos[Number(l.args.candidateId)] += 1;

      expect(desdeEventos).to.deep.equal((await registry.getTally(id)).map(Number));
    });

    it("el owner no puede alterar el recuento", async () => {
      const { registry, owner, relayer } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer);
      await registry.connect(relayer).castVote(id, nullifierOf("v1"), 0);

      // No existe ninguna función que escriba el recuento salvo castVote.
      const escrituras = registry.interface.fragments
        .filter((f: any) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f: any) => f.name)
        .sort();
      expect(escrituras).to.deep.equal([
        "acceptOwnership",
        "castVote",
        "createElection",
        "haltElection",
        "setRelayer",
        "transferOwnership",
      ]);

      // Y si el owner se autoriza a sí mismo, sigue sujeto a las mismas reglas.
      await registry.connect(owner).setRelayer(owner.address, true);
      await expect(registry.connect(owner).castVote(id, nullifierOf("v1"), 1))
        .to.be.revertedWith("ERR: nullifier already used (double-vote prevented)");
      expect(await registry.getTally(id)).to.deep.equal([1n, 0n, 0n]);
    });
  });

  describe("detener una elección (BC-06)", () => {
    it("solo el owner, con motivo, y una sola vez", async () => {
      const { registry, owner, relayer, outsider } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer);

      await expect(registry.connect(outsider).haltElection(id, REASON))
        .to.be.revertedWith("ERR: not owner");
      await expect(registry.connect(relayer).haltElection(id, REASON))
        .to.be.revertedWith("ERR: not owner");
      await expect(registry.connect(owner).haltElection(id, ethers.ZeroHash))
        .to.be.revertedWith("ERR: reasonHash cannot be zero");

      await expect(registry.connect(owner).haltElection(id, REASON))
        .to.emit(registry, "ElectionHalted").withArgs(id, REASON);
      await expect(registry.connect(owner).haltElection(id, REASON))
        .to.be.revertedWith("ERR: election already halted");
    });

    it("una vez detenida no admite votos y no hay forma de reabrirla", async () => {
      const { registry, owner, relayer } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer);
      await registry.connect(relayer).castVote(id, nullifierOf("antes"), 0);
      await registry.connect(owner).haltElection(id, REASON);

      await expect(registry.connect(relayer).castVote(id, nullifierOf("despues"), 0))
        .to.be.revertedWith("ERR: election halted");
      expect(await registry.isOpen(id)).to.equal(false);

      // No existe ninguna función de reapertura: el owner no puede cortar la
      // votación, mirar el marcador y volver a abrir.
      const nombres = registry.interface.fragments.map((f: any) => f.name ?? "");
      expect(nombres.some((n: string) => /reopen|setElectionStatus|closeElection/i.test(n))).to.equal(false);

      // Los votos ya emitidos siguen contando.
      expect(await registry.getTotalVotes(id)).to.equal(1n);
    });
  });

  describe("propiedad y relayers (BC-05, BC-13)", () => {
    it("el traspaso es en dos pasos", async () => {
      const { registry, owner, newOwner, outsider } = await loadFixture(deployFixture);

      await expect(registry.connect(outsider).transferOwnership(outsider.address))
        .to.be.revertedWith("ERR: not owner");
      await expect(registry.connect(owner).transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWith("ERR: new owner is zero");

      await expect(registry.connect(owner).transferOwnership(newOwner.address))
        .to.emit(registry, "OwnershipTransferStarted");
      // Todavía no ha cambiado nada.
      expect(await registry.owner()).to.equal(owner.address);

      await expect(registry.connect(outsider).acceptOwnership())
        .to.be.revertedWith("ERR: not pending owner");

      await expect(registry.connect(newOwner).acceptOwnership())
        .to.emit(registry, "OwnershipTransferred").withArgs(owner.address, newOwner.address);
      expect(await registry.owner()).to.equal(newOwner.address);
      expect(await registry.pendingOwner()).to.equal(ethers.ZeroAddress);

      // El owner anterior ya no manda.
      await expect(registry.connect(owner).setRelayer(owner.address, true))
        .to.be.revertedWith("ERR: not owner");
    });

    it("una clave de relayer comprometida se revoca sin redesplegar", async () => {
      const { registry, owner, relayer, outsider } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer);

      await expect(registry.connect(owner).setRelayer(relayer.address, false))
        .to.emit(registry, "RelayerSet").withArgs(relayer.address, false);
      await expect(registry.connect(relayer).castVote(id, nullifierOf("x"), 0))
        .to.be.revertedWith("ERR: not authorized relayer");

      // Y se autoriza la nueva.
      await registry.connect(owner).setRelayer(outsider.address, true);
      await expect(registry.connect(outsider).castVote(id, nullifierOf("x"), 0))
        .to.emit(registry, "VoteCast");
    });

    it("solo el owner gestiona relayers", async () => {
      const { registry, relayer, outsider } = await loadFixture(deployFixture);
      await expect(registry.connect(relayer).setRelayer(outsider.address, true))
        .to.be.revertedWith("ERR: not owner");
    });
  });

  describe("forma del evento y coste (BC-29, BC-04)", () => {
    it("la firma de VoteCast es la que consumen backend, frontend y recount", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer);
      const n = nullifierOf("firma");

      const receipt = await (await registry.connect(relayer).castVote(id, n, 2)).wait();
      const log = receipt!.logs[0];

      // Si alguien cambia el orden o el tipo de un parámetro, topic0 cambia y
      // este test cae — que es lo que no pasó con BC-29 y dejó el feed en vivo
      // sin dispararse durante meses.
      expect(log.topics[0]).to.equal(ethers.id("VoteCast(uint256,uint256,uint256,uint256)"));
      // electionId, nullifier y candidateId van indexados: se puede filtrar.
      expect(log.topics).to.have.lengthOf(4);

      const parsed = registry.interface.parseLog(log)!;
      expect(parsed.args.electionId).to.equal(BigInt(id));
      expect(parsed.args.nullifier).to.equal(n);
      expect(parsed.args.candidateId).to.equal(2n);
      expect(parsed.args.timestamp).to.equal(BigInt(await time.latest()));
    });

    it("la firma de ElectionCreated tampoco cambia sin avisar", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const receipt = await (
        await registry
          .connect(relayer)
          .createElection("X", await time.latest(), (await time.latest()) + 3600, 2, CANDIDATES_ROOT, CENSUS_ROOT)
      ).wait();

      expect(receipt!.logs[0].topics[0]).to.equal(
        ethers.id("ElectionCreated(uint256,string,uint256,uint256,uint256,bytes32,bytes32)"),
      );
    });

    it("un voto cuesta bastante menos que con voteHistory (BC-04)", async () => {
      const { registry, relayer } = await loadFixture(deployFixture);
      const id = await openElection(registry, relayer);

      const receipt = await (await registry.connect(relayer).castVote(id, nullifierOf("gas"), 0)).wait();

      // El contrato anterior hacía push de un VoteRecord de 4 palabras, ~100.000
      // gas por voto, duplicando lo que ya está en el evento. Si alguien lo
      // reintroduce, este límite salta.
      expect(receipt!.gasUsed).to.be.lessThan(130_000n);
    });
  });
});
