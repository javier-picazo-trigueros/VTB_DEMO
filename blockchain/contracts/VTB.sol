// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ElectionRegistry
 * @dev Hybrid Web2/Web3 anonymous voting registry.
 *
 * Architecture:
 * - Web2 (off-chain): SQLite stores users, census, PII — never touches blockchain.
 * - Web3 (on-chain): This contract stores election metadata, nullifier -> voteHash map,
 *   and per-election vote counts. Prevents double-voting via nullifier uniqueness.
 *
 * Vote flow:
 * 1. Backend validates identity against SQLite.
 * 2. Backend generates nullifier = HMAC-SHA256(userId + electionId + secret).
 * 3. Frontend computes voteHash = SHA256(candidateId + randomSalt).
 * 4. Backend (relayer) calls castVote(electionId, nullifier, voteHash).
 * 5. Contract verifies nullifier is fresh, stores vote, emits VoteCast event.
 * 6. Blockchain provides a public, immutable audit trail without revealing identity.
 */
contract ElectionRegistry {

    // =========================================================================
    // EVENTS
    // =========================================================================

    event VoteCast(
        uint256 indexed electionId,
        bytes32 indexed nullifier,
        bytes32 voteHash,
        uint256 timestamp
    );

    event ElectionCreated(
        uint256 indexed electionId,
        string name,
        uint256 startTime,
        uint256 endTime
    );

    event ElectionStatusChanged(
        uint256 indexed electionId,
        bool active
    );

    // =========================================================================
    // DATA STRUCTURES
    // =========================================================================

    struct Election {
        string name;
        uint256 startTime;
        uint256 endTime;
        bool active;
        uint256 totalVotes;
    }

    struct VoteRecord {
        bytes32 nullifier;
        bytes32 voteHash;
        uint256 timestamp;
        uint256 blockNumber;
    }

    // =========================================================================
    // STATE
    // =========================================================================

    address public owner;

    mapping(uint256 => Election) public elections;
    mapping(uint256 => mapping(bytes32 => bytes32)) public votes;
    mapping(uint256 => VoteRecord[]) public voteHistory;

    uint256 public electionCount;

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "ERR: not owner");
        _;
    }

    modifier electionExists(uint256 _id) {
        require(_id > 0 && _id <= electionCount, "ERR: election does not exist");
        _;
    }

    modifier electionIsActive(uint256 _id) {
        require(elections[_id].active, "ERR: election not active");
        require(
            block.timestamp >= elections[_id].startTime &&
            block.timestamp <= elections[_id].endTime,
            "ERR: election out of time window"
        );
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor() {
        owner = msg.sender;
        electionCount = 0;
    }

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    /**
     * @dev Create a new election. Only owner.
     * @param _name Human-readable election name.
     * @param _startTime Unix timestamp for start.
     * @param _endTime Unix timestamp for end (must be after start).
     */
    function createElection(
        string memory _name,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner {
        require(_endTime > _startTime, "ERR: end must be after start");
        require(_startTime >= block.timestamp, "ERR: start must be in the future");

        electionCount++;
        uint256 id = electionCount;

        elections[id] = Election({
            name: _name,
            startTime: _startTime,
            endTime: _endTime,
            active: true,
            totalVotes: 0
        });

        emit ElectionCreated(id, _name, _startTime, _endTime);
    }

    /**
     * @dev Set the active status of an election. Only owner.
     * @param _id Election ID.
     * @param _active True to activate, false to deactivate.
     */
    function setElectionStatus(uint256 _id, bool _active)
        external
        onlyOwner
        electionExists(_id)
    {
        elections[_id].active = _active;
        emit ElectionStatusChanged(_id, _active);
    }

    /**
     * @dev Deactivate an election. Convenience wrapper around setElectionStatus.
     */
    function closeElection(uint256 _id)
        external
        onlyOwner
        electionExists(_id)
    {
        elections[_id].active = false;
        emit ElectionStatusChanged(_id, false);
    }

    // =========================================================================
    // VOTING
    // =========================================================================

    /**
     * @dev Register an anonymous vote. Called by the backend relayer.
     *
     * @param _electionId Election to vote in.
     * @param _nullifier Deterministic anonymous voter token (HMAC off-chain).
     *                   Uniqueness enforces one-vote-per-user on-chain.
     * @param _voteHash  Encrypted vote commitment (SHA256 of choice + salt).
     *                   The contract never learns the actual candidate.
     */
    function castVote(
        uint256 _electionId,
        bytes32 _nullifier,
        bytes32 _voteHash
    ) external electionExists(_electionId) electionIsActive(_electionId) {
        require(_nullifier != bytes32(0), "ERR: nullifier cannot be zero");
        require(_voteHash != bytes32(0), "ERR: voteHash cannot be zero");
        require(
            votes[_electionId][_nullifier] == bytes32(0),
            "ERR: nullifier already used (double-vote prevented)"
        );

        votes[_electionId][_nullifier] = _voteHash;
        elections[_electionId].totalVotes++;

        voteHistory[_electionId].push(VoteRecord({
            nullifier: _nullifier,
            voteHash: _voteHash,
            timestamp: block.timestamp,
            blockNumber: block.number
        }));

        emit VoteCast(_electionId, _nullifier, _voteHash, block.timestamp);
    }

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /**
     * @dev Return full election metadata.
     */
    function getElection(uint256 _id)
        public
        view
        electionExists(_id)
        returns (
            string memory name,
            uint256 startTime,
            uint256 endTime,
            bool active,
            uint256 totalVotes
        )
    {
        Election storage e = elections[_id];
        return (e.name, e.startTime, e.endTime, e.active, e.totalVotes);
    }

    /**
     * @dev Return total votes cast in an election.
     */
    function getVoteCount(uint256 _id)
        public
        view
        electionExists(_id)
        returns (uint256)
    {
        return elections[_id].totalVotes;
    }

    /**
     * @dev Alias for getVoteCount — used by backend results verification.
     */
    function getTotalVotes(uint256 _id)
        public
        view
        electionExists(_id)
        returns (uint256)
    {
        return elections[_id].totalVotes;
    }

    /**
     * @dev Check whether a nullifier has already voted.
     */
    function hasVoted(uint256 _id, bytes32 _nullifier)
        public
        view
        electionExists(_id)
        returns (bool)
    {
        return votes[_id][_nullifier] != bytes32(0);
    }

    /**
     * @dev Return the stored voteHash for a nullifier (for audit verification).
     */
    function getVoteHash(uint256 _id, bytes32 _nullifier)
        public
        view
        electionExists(_id)
        returns (bytes32)
    {
        return votes[_id][_nullifier];
    }

    /**
     * @dev Return the full vote history for an election (public audit).
     *      Only nullifier + voteHash are stored — no personal data ever on-chain.
     */
    function getVoteHistory(uint256 _id)
        public
        view
        electionExists(_id)
        returns (VoteRecord[] memory)
    {
        return voteHistory[_id];
    }

    /**
     * @dev Return the total number of elections created.
     */
    function getElectionCount() public view returns (uint256) {
        return electionCount;
    }
}
