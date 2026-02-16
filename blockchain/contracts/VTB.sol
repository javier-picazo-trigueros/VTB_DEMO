// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ElectionRegistry (VTB - Vote Through Blockchain)
 * @author Senior Web3 Architect - Universidad (3º Ingeniería Informática)
 * @dev Smart Contract que gestiona elecciones y votos de forma anónima
 *
 * ARQUITECTURA HÍBRIDA EXPLICACIÓN:
 * ================================
 * 1. WEB2 (Off-chain): SQLite DB en Backend almacena:
 *    - Usuarios registrados (email, hash de contraseña)
 *    - Censo electoral (quién tiene derecho a votar)
 *    - Identidad personal (PII - nunca va a blockchain)
 *    - Generates: nullifier = HMAC-SHA256(user_id, election_id, secret_key)
 *
 * 2. WEB3 (On-chain): Este contrato almacena:
 *    - Mapeo de elecciones (election_id -> contadores)
 *    - Votos registrados como: (nullifier -> voteHash)
 *    - Previene double-voting mediante nullifier único por voto
 *    - Emite eventos auditables sin revelar identidad
 *
 * 3. FLOW DE VOTACIÓN:
 *    a) Usuario autentica en Login (Web2) -> Backend verifica credenciales en SQLite
 *    b) Backend genera nullifier secreto (HMAC) y lo devuelve al frontend encriptado
 *    c) Frontend prepara voto: voteHash = SHA256(opción_seleccionada + salt_aleatorio)
 *    d) Frontend envía tx a Hardhat: castVote(electionId, nullifier, voteHash)
 *    e) Smart Contract valida que nullifier no existe (first-time voter)
 *    f) Emite evento VoteCast(nullifier, voteHash) -> escuchado por Live Feed
 *    g) Live Feed muestra SOLO nullifier + txHash (máxima privacidad)
 *
 * 4. SEGURIDAD:
 *    - Nullifier = función determinista pero imposible de invertir
 *    - VoteHash = cifrado del voto (hash) impide conocer qué votó
 *    - Dos usuarios ≠ dos nullifiers garantiza anonimato por usuario
 *    - Blockchain = auditoría pública de integridad sin revelar identidades
 */

contract ElectionRegistry {
    // ============================================================
    // EVENTOS
    // ============================================================

    /**
     * @dev Emitido cuando un voto es registrado exitosamente
     * @param electionId ID de la elección
     * @param nullifier Hash anónimo único del votante (no identifica)
     * @param voteHash Hash del voto cifrado (no se conoce qué se votó)
     * @param timestamp Momento exacto del voto (para auditoría)
     */
    event VoteCast(
        uint256 indexed electionId,
        bytes32 indexed nullifier,
        bytes32 voteHash,
        uint256 timestamp
    );

    /**
     * @dev Emitido cuando se crea una nueva elección
     */
    event ElectionCreated(
        uint256 indexed electionId,
        string name,
        uint256 startTime,
        uint256 endTime
    );

    /**
     * @dev Emitido cuando se intenta voto duplicado (fallo de seguridad)
     */
    event DoubleVoteAttempted(
        uint256 indexed electionId,
        bytes32 indexed nullifier,
        uint256 timestamp
    );

    // ============================================================
    // ESTRUCTURAS DE DATOS
    // ============================================================

    /**
     * @dev Información de cada elección
     */
    struct Election {
        string name;
        uint256 startTime;
        uint256 endTime;
        bool active;
        uint256 totalVotes;
    }

    /**
     * @dev Registro de cada voto (para auditoría)
     */
    struct VoteRecord {
        bytes32 nullifier;
        bytes32 voteHash;
        uint256 timestamp;
        uint256 blockNumber;
    }

    // ============================================================
    // ESTADO DEL CONTRATO
    // ============================================================

    // Admin del contrato (quien puede crear elecciones)
    address public owner;

    // Mapeo: electionId -> información de elección
    mapping(uint256 => Election) public elections;

    // Mapeo: electionId -> (nullifier -> voteHash)
    // Esto previene double-voting: si nullifier ya existe, no se permite
    mapping(uint256 => mapping(bytes32 => bytes32)) public votes;

    // Mapeo: electionId -> array de records de votos (para auditoría)
    mapping(uint256 => VoteRecord[]) public voteHistory;

    // Contador de elecciones
    uint256 public electionCount;

    // ============================================================
    // MODIFICADORES
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "ERR: Solo el dueño puede llamar");
        _; 
    }

    modifier electionExists(uint256 _electionId) {
        require(_electionId > 0 && _electionId <= electionCount, "ERR: Elección no existe");
        _;
    }

    modifier electionActive(uint256 _electionId) {
        require(elections[_electionId].active, "ERR: Elección no está activa");
        require(
            block.timestamp >= elections[_electionId].startTime &&
            block.timestamp <= elections[_electionId].endTime,
            "ERR: Elección fuera de horario"
        );
        _;
    }

    // ============================================================
    // FUNCIONES PÚBLICAS
    // ============================================================

    constructor() {
        owner = msg.sender;
        electionCount = 0;
    }

    /**
     * @dev Crea una nueva elección (solo Admin)
     * @param _name Nombre de la elección
     * @param _startTime Timestamp inicio
     * @param _endTime Timestamp fin
     *
     * NOTA: En producción, esto sería más refinado con:
     * - Control de acceso (RBAC)
     * - Multisig de administradores
     * - Timelock para cambios
     */
    function createElection(
        string memory _name,
        uint256 _startTime,
        uint256 _endTime
    ) public onlyOwner {
        require(_endTime > _startTime, "ERR: Fin debe ser después de inicio");
        require(_startTime > block.timestamp, "ERR: Inicio debe ser futuro");

        electionCount++;
        uint256 electionId = electionCount;

        elections[electionId] = Election({
            name: _name,
            startTime: _startTime,
            endTime: _endTime,
            active: true,
            totalVotes: 0
        });

        emit ElectionCreated(electionId, _name, _startTime, _endTime);
    }

    /**
     * @dev FUNCIÓN CRÍTICA: Registra un voto de forma anónima
     * @param _electionId ID de la elección
     * @param _nullifier Hash único del votante (generado off-chain por Backend)
     * @param _voteHash Hash del voto cifrado (no se conoce qué se votó)
     *
     * ARQUITECTURA HÍBRIDA - FLUJO:
     * 1. Backend (Web2) valida identidad del usuario contra SQLite
     * 2. Backend genera nullifier = HMAC-SHA256(user_id, election_id, secret) 
     * 3. Frontend encripta voto: voteHash = SHA256(vote + random_salt)
     * 4. Frontend llama esta función con nullifier + voteHash
     * 5. Contrato verifica:
     *    a) Elección existe y está activa
     *    b) nullifier NO ha votado aún (previene doble voto)
     * 6. Almacena voto y emite evento para Live Feed
     * 7. IMPORTANTE: Contrato NUNCA conoce identidad del usuario
     *    - Solo sabe que alguien votó (representado por nullifier)
     *    - El voto está cifrado (voteHash)
     *    - Blockchain audita transparencia sin revelar PII
     */
    function castVote(
        uint256 _electionId,
        bytes32 _nullifier,
        bytes32 _voteHash
    ) public electionExists(_electionId) electionActive(_electionId) {
        require(_nullifier != bytes32(0), "ERR: Nullifier no puede ser vacío");
        require(_voteHash != bytes32(0), "ERR: VoteHash no puede ser vacío");

        // VALIDACIÓN CRÍTICA: Prevenir double-voting
        if (votes[_electionId][_nullifier] != bytes32(0)) {
            // Intento de voto duplicado detectado
            emit DoubleVoteAttempted(_electionId, _nullifier, block.timestamp);
            revert("ERR: Este usuario ya votó en esta elección");
        }

        // Registrar voto
        votes[_electionId][_nullifier] = _voteHash;

        // Incrementar contador
        elections[_electionId].totalVotes++;

        // Guardar en historial (para auditoría)
        voteHistory[_electionId].push(VoteRecord({
            nullifier: _nullifier,
            voteHash: _voteHash,
            timestamp: block.timestamp,
            blockNumber: block.number
        }));

        // EVENTO CRÍTICO para Live Feed
        // Emite solo información de auditoría (nullifier + voteHash)
        // NO emite identidad personal
        emit VoteCast(_electionId, _nullifier, _voteHash, block.timestamp);
    }

    /**
     * @dev Retorna número total de votos en una elección
     */
    function getVoteCount(uint256 _electionId) 
        public 
        view 
        electionExists(_electionId) 
        returns (uint256) 
    {
        return elections[_electionId].totalVotes;
    }

    /**
     * @dev Verifica si un nullifier ha votado en una elección
     * (Usado por Backend para validariones)
     */
    function hasVoted(uint256 _electionId, bytes32 _nullifier)
        public
        view
        electionExists(_electionId)
        returns (bool)
    {
        return votes[_electionId][_nullifier] != bytes32(0);
    }

    /**
     * @dev Retorna el vode hash de un voto (para validación)
     * (Usado por auditoría)
     */
    function getVoteHash(uint256 _electionId, bytes32 _nullifier)
        public
        view
        electionExists(_electionId)
        returns (bytes32)
    {
        return votes[_electionId][_nullifier];
    }

    /**
     * @dev Retorna información completa de una elección
     */
    function getElection(uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (
            string memory name,
            uint256 startTime,
            uint256 endTime,
            bool active,
            uint256 totalVotes
        )
    {
        Election storage election = elections[_electionId];
        return (
            election.name,
            election.startTime,
            election.endTime,
            election.active,
            election.totalVotes
        );
    }

    /**
     * @dev Retorna historial de votos (AUDITORÍA PÚBLICA)
     * Nota: Solo retorna nullifier y voteHash (anónimo)
     */
    function getVoteHistory(uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (VoteRecord[] memory)
    {
        return voteHistory[_electionId];
    }

    /**
     * @dev Admin puede desactivar una elección
     */
    function closeElection(uint256 _electionId)
        public
        onlyOwner
        electionExists(_electionId)
    {
        elections[_electionId].active = false;
    }

    /**
     * @dev Retorna el conteo total de elecciones
     */
    function getElectionCount() public view returns (uint256) {
        return electionCount;
    }
}
