// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title ElectionRegistryV2
 * @notice Registro de elecciones y votos con recuento verificable desde fuera.
 *
 * ── Qué cambia frente a ElectionRegistry (VTB.sol) ───────────────────────────
 *
 * La versión anterior recibía un `voteHash` opaco: en la cadena constaba que
 * alguien había votado, pero no a quién. Nadie podía recontar sin fiarse de la
 * base de datos del backend, que es justo lo que el proyecto dice evitar.
 *
 * Aquí el voto lleva `candidateId` en claro y el contrato mantiene el recuento
 * por candidato. Un tercero recuenta con `getTally(electionId)` o sumando los
 * eventos `VoteCast`, sin permiso ni acceso a la aplicación.
 *
 * La contrapartida es deliberada y está documentada en SEGURIDAD.md: el reparto
 * de votos es público DURANTE la votación, no solo al cierre. Quien necesite lo
 * contrario necesita compromiso y apertura al cierre, que es otro contrato.
 *
 * ── Qué NO promete ──────────────────────────────────────────────────────────
 *
 * El voto NO es anónimo. El nullifier lo deriva hoy el backend con un secreto
 * propio (HMAC de userId y electionId), así que quien tenga ese secreto puede
 * relacionar cada voto de la cadena con su votante. Lo que sí garantiza este
 * contrato es registro inmutable, recuento recontable por terceros y prevención
 * criptográfica del doble voto. El anonimato llega con Semaphore, y para eso
 * `censusRoot` ya está reservado (ver más abajo).
 *
 * ── Hallazgos de AUDITORIA_BLOCKCHAIN.md que se cierran aquí ────────────────
 *
 *   BC-01  `castVote` exige relayer autorizado. Antes cualquiera podía inflar
 *          el recuento con nullifiers inventados, gratis, en una testnet.
 *   BC-04  Fuera `voteHistory`: duplicaba en storage (~100.000 gas por voto) lo
 *          que ya está en el evento, y `getVoteHistory` dejaba de responder en
 *          elecciones grandes. El recuento por candidato cuesta mucho menos.
 *   BC-05  El owner (frío) y el relayer (caliente, en el backend) son claves
 *          distintas y rotables.
 *   BC-06  El owner ya no puede cerrar una elección en curso para congelar un
 *          marcador que le convenga. Solo puede `haltElection`, que es de un
 *          solo sentido, exige motivo y queda en la cadena a la vista.
 *   BC-07  La ventana temporal on-chain es la real. Se elimina el
 *          `require(_startTime >= block.timestamp)` que obligaba al backend a
 *          empujar el inicio 120 s al futuro y a estirar el cierre.
 *   BC-13  `transferOwnership` en dos pasos. La versión anterior fijaba el
 *          owner en el constructor y no se podía rotar: una clave filtrada
 *          obligaba a redesplegar y perder el histórico.
 *
 * ── Lo que se conserva a propósito ──────────────────────────────────────────
 *
 * Los textos de los `require` que el backend reconoce por subcadena ("election
 * does not exist", "nullifier already used") se mantienen literales. Cambiarlos
 * por errores personalizados sería más limpio en gas y rompería en silencio la
 * traducción de errores a 409 y 503 de routes/elections.ts.
 */
contract ElectionRegistryV2 {
    // =========================================================================
    // CONSTANTES
    // =========================================================================

    /// @dev Acota `getTally`, que devuelve un array de este tamaño como máximo.
    uint256 public constant MAX_CANDIDATES = 64;

    // =========================================================================
    // TIPOS
    // =========================================================================

    struct Election {
        string  name;
        uint256 startTime;
        uint256 endTime;
        /// @dev Los candidatos son 0..candidateCount-1, sin desplazamiento.
        uint256 candidateCount;
        /// @dev keccak256 de la lista canónica de candidatos, que se publica
        ///      fuera de la cadena. Los nombres son de personas reales y no
        ///      pueden ir on-chain: serían datos personales inmutables.
        bytes32 candidatesRoot;
        /// @dev Reservado para Semaphore: raíz del árbol de Merkle del censo.
        ///      Hoy el backend lo deja a cero porque no hay pruebas de
        ///      pertenencia. Está aquí para que la forma del evento no cambie
        ///      cuando las haya.
        bytes32 censusRoot;
        bool    halted;
        uint256 totalVotes;
    }

    // =========================================================================
    // ESTADO
    // =========================================================================

    address public owner;
    address public pendingOwner;

    /// @dev Bloque de despliegue: quien recuente desde fuera necesita saber
    ///      desde dónde escanear los logs, y así no depende de un JSON del repo.
    uint256 public immutable deploymentBlock;

    uint256 public electionCount;

    mapping(address => bool) public isRelayer;

    mapping(uint256 => Election) private _elections;

    /// @dev electionId => nullifier => ya votó. Un bool separado (y no el
    ///      candidato desplazado en uno) para que el candidato 0 sea un
    ///      candidato normal en todo el stack, sin conversiones a mitad.
    mapping(uint256 => mapping(uint256 => bool)) public hasVoted;

    /// @dev electionId => candidateId => votos. Es el recuento verificable.
    mapping(uint256 => mapping(uint256 => uint256)) public votesFor;

    // =========================================================================
    // EVENTOS
    // =========================================================================

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RelayerSet(address indexed relayer, bool allowed);

    event ElectionCreated(
        uint256 indexed electionId,
        string  name,
        uint256 startTime,
        uint256 endTime,
        uint256 candidateCount,
        bytes32 candidatesRoot,
        bytes32 censusRoot
    );

    /// @dev Los tres campos indexados permiten recontar filtrando por elección
    ///      o por candidato, y localizar un voto por su nullifier, sin traerse
    ///      todos los logs del contrato.
    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed nullifier,
        uint256 indexed candidateId,
        uint256 timestamp
    );

    event ElectionHalted(uint256 indexed electionId, bytes32 reasonHash);

    // =========================================================================
    // MODIFICADORES
    // =========================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "ERR: not owner");
        _;
    }

    modifier onlyRelayer() {
        require(isRelayer[msg.sender], "ERR: not authorized relayer");
        _;
    }

    modifier electionExists(uint256 _id) {
        require(_id > 0 && _id <= electionCount, "ERR: election does not exist");
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * @param _initialRelayer Dirección caliente del backend, autorizada a crear
     *        elecciones y registrar votos. Puede ser cero para autorizarla
     *        después: quien despliega es el owner, y conviene que sea una clave
     *        fría que no viva en el `.env` de ningún servidor.
     */
    constructor(address _initialRelayer) {
        owner = msg.sender;
        deploymentBlock = block.number;
        emit OwnershipTransferred(address(0), msg.sender);

        if (_initialRelayer != address(0)) {
            isRelayer[_initialRelayer] = true;
            emit RelayerSet(_initialRelayer, true);
        }
    }

    // =========================================================================
    // PROPIEDAD Y RELAYERS
    // =========================================================================

    /// @notice Inicia el traspaso. No surte efecto hasta `acceptOwnership`.
    /// @dev En dos pasos a propósito: un traspaso a una dirección mal escrita
    ///      dejaría el contrato sin owner y sin forma de rotar relayers.
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "ERR: new owner is zero");
        pendingOwner = _newOwner;
        emit OwnershipTransferStarted(owner, _newOwner);
    }

    /// @notice El destinatario confirma que controla la clave.
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "ERR: not pending owner");
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    /// @notice Autoriza o revoca una dirección relayer. Solo el owner.
    function setRelayer(address _relayer, bool _allowed) external onlyOwner {
        require(_relayer != address(0), "ERR: relayer is zero");
        isRelayer[_relayer] = _allowed;
        emit RelayerSet(_relayer, _allowed);
    }

    // =========================================================================
    // ELECCIONES
    // =========================================================================

    /**
     * @notice Registra una elección. La llama el backend (relayer), no el owner:
     *         la clave del owner está fuera del servidor y no puede firmar en
     *         cada creación.
     *
     * @param _name           Nombre público de la elección.
     * @param _startTime      Inicio real. Puede estar en el pasado (BC-07).
     * @param _endTime        Cierre real.
     * @param _candidateCount Número de candidatos; los ids válidos son
     *                        0.._candidateCount-1.
     * @param _candidatesRoot keccak256 de la lista canónica de candidatos.
     * @param _censusRoot     Reservado para Semaphore; hoy cero.
     * @return id Identificador on-chain. Se lee del evento, nunca de
     *         `electionCount`, que puede haber avanzado por otra creación.
     */
    function createElection(
        string calldata _name,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _candidateCount,
        bytes32 _candidatesRoot,
        bytes32 _censusRoot
    ) external onlyRelayer returns (uint256 id) {
        require(bytes(_name).length > 0 && bytes(_name).length <= 200, "ERR: invalid name length");
        require(_endTime > _startTime, "ERR: end must be after start");
        // Sí se exige que quede tiempo por delante: registrar una elección ya
        // cerrada solo puede ser un error de sincronización, y sus votos nunca
        // llegarían a entrar.
        require(_endTime > block.timestamp, "ERR: end must be in the future");
        require(
            _candidateCount > 0 && _candidateCount <= MAX_CANDIDATES,
            "ERR: invalid candidate count"
        );
        require(_candidatesRoot != bytes32(0), "ERR: candidatesRoot cannot be zero");

        electionCount++;
        id = electionCount;

        _elections[id] = Election({
            name:           _name,
            startTime:      _startTime,
            endTime:        _endTime,
            candidateCount: _candidateCount,
            candidatesRoot: _candidatesRoot,
            censusRoot:     _censusRoot,
            halted:         false,
            totalVotes:     0
        });

        emit ElectionCreated(id, _name, _startTime, _endTime, _candidateCount, _candidatesRoot, _censusRoot);
    }

    /**
     * @notice Detiene una elección de forma irreversible. Solo el owner.
     *
     * @dev Sustituye a `closeElection`/`setElectionStatus`, con los que el owner
     *      podía cerrar en mitad de la votación y reabrir después (BC-06). Una
     *      elección se cierra por `endTime`, no por decisión de nadie.
     *
     *      Esto no elimina la censura —quien controla el relayer siempre puede
     *      dejar de retransmitir votos— pero la deja registrada en la cadena en
     *      lugar de dejarla invisible.
     *
     * @param _reasonHash Hash del motivo documentado fuera de la cadena. No se
     *        admite cero: detener una votación exige dejar constancia.
     */
    function haltElection(uint256 _id, bytes32 _reasonHash)
        external
        onlyOwner
        electionExists(_id)
    {
        require(!_elections[_id].halted, "ERR: election already halted");
        require(_reasonHash != bytes32(0), "ERR: reasonHash cannot be zero");
        _elections[_id].halted = true;
        emit ElectionHalted(_id, _reasonHash);
    }

    // =========================================================================
    // VOTO
    // =========================================================================

    /**
     * @notice Registra un voto. Solo un relayer autorizado.
     *
     * @param _electionId  Identificador on-chain de la elección.
     * @param _nullifier   Testigo único del votante para esta elección. El
     *                     contrato no asume nada sobre cómo se deriva: hoy es un
     *                     HMAC del backend, con Semaphore saldrá de la prueba de
     *                     pertenencia. Por eso es `uint256`, que es el tipo que
     *                     usa Semaphore.
     * @param _candidateId Candidato elegido, 0..candidateCount-1.
     */
    function castVote(
        uint256 _electionId,
        uint256 _nullifier,
        uint256 _candidateId
    ) external onlyRelayer electionExists(_electionId) {
        Election storage e = _elections[_electionId];

        require(!e.halted, "ERR: election halted");
        require(block.timestamp >= e.startTime, "ERR: election has not started");
        require(block.timestamp <= e.endTime, "ERR: election out of time window");
        require(_nullifier != 0, "ERR: nullifier cannot be zero");
        require(_candidateId < e.candidateCount, "ERR: candidate out of range");
        require(
            !hasVoted[_electionId][_nullifier],
            "ERR: nullifier already used (double-vote prevented)"
        );

        hasVoted[_electionId][_nullifier] = true;
        votesFor[_electionId][_candidateId] += 1;
        e.totalVotes += 1;

        emit VoteCast(_electionId, _nullifier, _candidateId, block.timestamp);
    }

    // =========================================================================
    // LECTURA
    // =========================================================================

    /// @notice Recuento por candidato. `tally[i]` son los votos del candidato i.
    /// @dev Es la función que hace recontable la elección desde fuera sin
    ///      escanear logs. No hay ninguna función que lo modifique salvo
    ///      `castVote`: ni el owner puede tocar estos números.
    function getTally(uint256 _id)
        external
        view
        electionExists(_id)
        returns (uint256[] memory tally)
    {
        Election storage e = _elections[_id];
        tally = new uint256[](e.candidateCount);
        for (uint256 i = 0; i < e.candidateCount; i++) {
            tally[i] = votesFor[_id][i];
        }
    }

    function getElection(uint256 _id)
        external
        view
        electionExists(_id)
        returns (Election memory)
    {
        return _elections[_id];
    }

    /// @notice Total de votos de una elección.
    /// @dev Se conserva el nombre que ya usa el backend para comprobar recuentos.
    function getTotalVotes(uint256 _id)
        external
        view
        electionExists(_id)
        returns (uint256)
    {
        return _elections[_id].totalVotes;
    }

    /// @notice ¿Admite votos ahora mismo?
    function isOpen(uint256 _id) external view electionExists(_id) returns (bool) {
        Election storage e = _elections[_id];
        return !e.halted && block.timestamp >= e.startTime && block.timestamp <= e.endTime;
    }

    function getElectionCount() external view returns (uint256) {
        return electionCount;
    }
}
