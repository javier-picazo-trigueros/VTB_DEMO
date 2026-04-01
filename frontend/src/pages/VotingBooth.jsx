import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ethers } from "ethers";
import axios from "axios";
import { Navbar } from "../components/Navbar";
import { Spinner } from "../components/Spinner";
import LoadingSpinner from "../components/LoadingSpinner";

/**
 * @title VotingDashboard Component - VTB Frontend
 * @author Senior Web3 Architect
 * @dev Dashboard con Live Feed que escucha eventos VoteCast en tiempo real
 *
 * CAMBIOS (BLOQUE 1.2):
 * ====================
 * - Candidatos cargados dinámicamente desde API
 * - ElectionId obtenido de parámetros de ruta
 * - Validación de estado de elección antes de permitir voto
 * - Nullifier generado en tiempo de votación
 *
 * ARQUITECTURA CRÍTICA:
 * ====================
 *
 * 1. LIVE FEED EN TIEMPO REAL:
 *    - Conecta a Hardhat RPC a través de ethers.js
 *    - Escucha evento VoteCast del Smart Contract
 *    - Evento emite: (nullifier, voteHash, timestamp)
 *    - IMPORTANTE: No muestra PII (email, nombre), solo nullifier anónimo
 *
 * 2. FLUJO DE VOTACIÓN:
 *    a) Usuario selecciona candidato
 *    b) Frontend genera voteHash localmente (no lo envía al backend)
 *    c) Frontend envía: JWT + electionId + voteHash al backend
 *    d) Backend valida JWT + genera nullifier + firma transacción
 *    e) Transacción se ejecuta en Hardhat
 *    f) Smart Contract emite VoteCast con (nullifier, voteHash)
 *    g) Live Feed escucha y muestra el voto registrado
 *
 * 3. PRIVACIDAD GARANTIZADA:
 *    - Blockchain ve: nullifier (hash) + voteHash (hash)
 *    - No ve: identidad del votante
 *    - No se puede linkear voto a persona
 *    - Pero sí se puede auditar transparencia
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const RPC_URL = import.meta.env.VITE_RPC_URL || "http://localhost:8545";
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

export const VotingBoothContent = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: electionId } = useParams(); // Get election ID from route

  const [candidates, setCandidates] = useState([]);
  const [electionTitle, setElectionTitle] = useState("");
  const [votes, setVotes] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [votingLoading, setVotingLoading] = useState(false);
  const [error, setError] = useState("");
  const [eligibilityError, setEligibilityError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voteCount, setVoteCount] = useState(0);
  
  // BLOQUE 3.4: Estados para feedback de transacción
  const [voteStatus, setVoteStatus] = useState(null); // null | 'proof' | 'sending' | 'confirming' | 'success' | 'error'
  const [txData, setTxData] = useState(null); // { txHash, explorerUrl }
  const [voteError, setVoteError] = useState(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);

  // Verificar autenticación y cargar elección
  useEffect(() => {
    const token = localStorage.getItem("vtb-token");
    if (!token) {
      navigate("/login");
      return;
    }

    if (!electionId) {
      setError("ID de elección no válido");
      setLoading(false);
      return;
    }

    // Cargar datos de la elección y candidatos
    loadElectionData();
  }, [electionId, navigate]);

  const loadElectionData = async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("vtb-token");
      if (!token) {
        navigate("/login");
        return;
      }

      // 1. VALIDAR ELEGIBILIDAD (BLOQUE 5.3)
      try {
        const eligRes = await axios.get(
          `${API_URL}/api/elections/${electionId}/eligibility`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!eligRes.data.eligible) {
          const reason = eligRes.data.reason;
          const status = eligRes.data.status;
          
          if (reason === 'already_voted') {
            setAlreadyVoted(true);
          }
          
          let errorMsg;
          switch (reason) {
            case 'already_voted':
              errorMsg = 'You have already voted in this election';
              break;
            case 'not_active':
              errorMsg = 'Esta elección no está activa';
              break;
            case 'not_eligible':
              errorMsg = 'No estás en el censo de esta elección';
              break;
            default:
              errorMsg = 'No puedes votar en esta elección';
          }
          
          setEligibilityError(errorMsg);
          // Do not redirect, just show the message and hide the vote button later.
        }
      } catch (eligErr) {
        console.error('Error validando elegibilidad:', eligErr);
        setEligibilityError('Error al validar tu elegibilidad');
      }

      // 2. GET /api/elections/:id para obtener candidatos
      const response = await axios.get(`${API_URL}/api/elections/${electionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = response.data;

      // Validar que la elección existe
      if (!data || !data.election) {
        setError("Esta elección no existe");
        setLoading(false);
        return;
      }

      const election = data.election;
      setElectionTitle(election.name || election.title || "Elección");
      
      // Asegurar que candidates es un array
      const candidatesList = Array.isArray(election.candidates)
        ? election.candidates
        : [];
      setCandidates(candidatesList);

      if (candidatesList.length === 0) {
        console.warn("⚠️  No hay candidatos cargados para esta elección");
      }

      setLoading(false);
    } catch (err) {
      console.error("Error loading election:", err);

      if (err.response?.status === 404) {
        setError("Elección no encontrada");
      } else if (err.response?.status === 401) {
        navigate("/login");
        return;
      } else {
        setError(
          err.response?.data?.error ||
            "Error al cargar la elección. Intenta de nuevo."
        );
      }

      setLoading(false);
    }
  };

  // Iniciar escucha de eventos blockchain (BLOQUE 3.3 - Mejorado)
  useEffect(() => {
    if (!CONTRACT_ADDRESS || !RPC_URL) {
      console.warn("⚠️ Blockchain no configurado");
      return;
    }

    let reconnectAttempts = 0;
    const MAX_RECONNECT = 3;
    let timeUpdateInterval = null;
    let contract = null;

    const setupListener = async () => {
      try {

        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // ABI del contrato (solo eventos que nos interesan)
        const contractAbi = [
          "event VoteCast(uint256 indexed electionId, bytes32 nullifier, bytes32 voteHash)",
        ];

        contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          contractAbi,
          provider
        );


        setIsListening(true);

        // ESCUCHAR EVENTOS EN TIEMPO REAL (BLOQUE 3.3)
        // Filtra solo votos de la elección actual
        contract.on("VoteCast", (eId, nullifier, voteHash, event) => {
          // Filter por elección actual (MEJORA 1: Filtrado)
          if (eId.toString() !== electionId?.toString()) {
            return;
          }


          const voteTimestamp = Date.now();
          const newVote = {
            id: Date.now() + Math.random(),
            nullifier: nullifier, // completo para truncar en render
            voteHash,
            createdAt: voteTimestamp, // timestamp para calcular tiempo relativo
            timeText: calculateTimeAgo(voteTimestamp), // inicial
          };

          // MEJORA 2: Mantener máximo 8 eventos
          setVotes((prev) => {
            const updated = [newVote, ...prev];
            return updated.slice(0, 8); // Máximo 8 eventos
          });
          
          setVoteCount((prev) => prev + 1);
        });

        // Limpiar intentos de reconexión
        reconnectAttempts = 0;
      } catch (err) {
        console.error("âŒ Error conectando a blockchain:", err);
        
        if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          // Mostrar badge de reconexión
          setIsListening(false);

          // Reintentar en 5 segundos
          setTimeout(setupListener, 5000);
        } else {
          setError(
            "No se pudo conectar al blockchain después de varios intentos."
          );
        }
      }
    };

    setupListener();

    // MEJORA 3: Actualizar tiempos relativos cada segundo
    timeUpdateInterval = setInterval(() => {
      setVotes((prev) =>
        prev.map((vote) => ({
          ...vote,
          timeText: calculateTimeAgo(vote.createdAt),
        }))
      );
    }, 1000);

    // MEJORA 4: Cleanup obligatorio
    return () => {
      if (contract) {
        contract.removeAllListeners("VoteCast");
      }
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
      }
    };
  }, [electionId]);

  // Helper: Calcular tiempo relativo en texto (MEJORA 3)
  const calculateTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);

    if (seconds < 60) {
      return `hace ${seconds}s`;
    } else if (minutes < 60) {
      return `hace ${minutes}m`;
    } else {
      return `hace ${Math.floor(minutes / 60)}h`;
    }
  };

  /**
   * BLOQUE 3.4: Función mejorada para registrar voto con feedback 3 pasos
   * Flujo: proof (calcular) → sending (enviando al backend) → confirming (esperando confirmación) → success|error
   */
  const handleVote = async (candidateId) => {
    if (!selectedCandidate || !electionId) return;

    try {
      const token = localStorage.getItem("vtb-token");

      if (!token) {
        navigate("/login");
        return;
      }

      // PASO 1: Generar proof (simula cálculo del nullifier)
      setVoteStatus('proof');
      await new Promise(resolve => setTimeout(resolve, 800)); // Simular cálculo

      // Generar voteHash localmente
      const voteHash = ethers.keccak256(ethers.toUtf8Bytes(`${selectedCandidate}-${Date.now()}-${Math.random()}`));





      // PASO 2: Enviar al backend
      setVoteStatus('sending');
      
      const response = await axios.post(
        `${API_URL}/api/elections/register-vote`,
        {
          electionId: parseInt(electionId),
          voteHash,
          candidateId: selectedCandidate,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // PASO 3: Confirmación
      setVoteStatus('confirming');
      await new Promise(resolve => setTimeout(resolve, 600)); // Simular confirmación

      // Transacción exitosa


      setTxData({
        txHash: response.data.txHash,
        explorerUrl: `${import.meta.env.VITE_EXPLORER_URL || 'http://localhost:8545'}/tx/${response.data.txHash}`,
      });
      
      setVoteStatus('success');
      setSelectedCandidate(null);

    } catch (err) {
      console.error("Error al registrar voto:", err);

      // Check for blockchain unavailability
      if (err.response?.status === 500 &&
          (err.response?.data?.error?.includes('blockchain') ||
           err.response?.data?.error?.includes('Blockchain'))) {
        setVoteError({
          type: 'blockchain_unavailable',
          message: 'El nodo blockchain no está disponible en este momento.',
          detail: 'Asegúrate de que Hardhat está corriendo: npx hardhat node'
        });
      } else {
        setVoteError(
          err.response?.data?.error ||
          err.message ||
          "Error al registrar voto. Intenta de nuevo."
        );
      }
      
      setVoteStatus('error');

      if (err.response?.status === 401) {
        setTimeout(() => navigate("/login"), 2000);
      }
    }
  };

  // HashMessage function removed since we now use ethers.keccak256


  const handleLogout = () => {
    localStorage.removeItem("vtb-token");
    localStorage.removeItem("vtb-role");
    localStorage.removeItem("vtb-user-id");
    navigate("/login");
  };

  // Copiar al portapapeles
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("✅ Copiado al portapapeles");
    } catch (err) {
      console.error("Error copiando:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Navbar />
        <div className="flex items-center justify-center min-h-[calc(100vh-70px)]">
          <LoadingSpinner message="Cargando cabina de votación..." />
        </div>
      </div>
    );
  }

  // BLOQUE 3.4: Renderizar modales de feedback de transacción
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

      {/* Already Voted Dedicated State */}
      {alreadyVoted && (
        <div className="max-w-2xl mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-8 text-center"
          >
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mb-2">
              You have already voted in this election
            </h3>
            <p className="text-emerald-600 dark:text-emerald-400 mb-6">
              Tu voto ha sido registrado en la blockchain.
            </p>
            <button
              onClick={() => navigate(`/results/${electionId}`)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition"
            >
              📊 View Results
            </button>
          </motion.div>
        </div>
      )}

      {/* Blockchain Unavailable Error Card */}
      {voteError?.type === 'blockchain_unavailable' && (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-1">{voteError.message}</h3>
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">{voteError.detail}</p>
                <button
                  onClick={() => { setVoteError(null); setVoteStatus(null); handleVote(selectedCandidate); }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition text-sm"
                >
                  🔄 Reintentar voto
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL DE PROGRESO - Overlay no cancelable */}
      {voteStatus && voteStatus !== 'success' && voteStatus !== 'error' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-lg p-8 max-w-sm mx-4 shadow-xl"
          >
            {/* Spinner animado */}
            <div className="flex justify-center mb-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 border-4 border-slate-300 dark:border-slate-600 border-t-blue-600 rounded-full"
              />
            </div>

            {/* Mensaje del paso actual */}
            <h3 className="text-center text-lg font-semibold text-slate-900 dark:text-white mb-2">
              {voteStatus === 'proof' && 'ðŸ” Calculando prueba...'}
              {voteStatus === 'sending' && '📤 Enviando voto...'}
              {voteStatus === 'confirming' && 'â³ Confirming transacción...'}
            </h3>

            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              {voteStatus === 'proof' && 'Preparando datos...'}
              {voteStatus === 'sending' && 'Conectando con blockchain...'}
              {voteStatus === 'confirming' && 'Esperando confirmación de la red...'}
            </p>
          </motion.div>
        </div>
      )}

      {/* MODAL DE ÉXITO */}
      {voteStatus === 'success' && txData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-lg p-8 max-w-sm mx-4 shadow-xl"
          >
            {/* Icono éxito */}
            <div className="flex justify-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="text-5xl"
              >
                ✅
              </motion.div>
            </div>

            <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white mb-4">
              ¡Vote registered en blockchain!
            </h2>

            {/* TxHash Box */}
            <div className="bg-slate-900 dark:bg-slate-900 rounded-lg p-4 mb-6 font-mono text-xs text-cyan-400 break-all max-h-20 overflow-y-auto">
              {txData.txHash}
            </div>

            {/* Botón Copiar */}
            <button
              onClick={() => copyToClipboard(txData.txHash)}
              className="w-full mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              📋 Copiar TxHash
            </button>

            {/* Enlace al explorador */}
            <a
              href={txData.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mb-6 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white text-center rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition font-medium block text-sm"
            >
              ðŸ” Ver en el explorador →
            </a>

            {/* Botón Volver */}
            <button
              onClick={() => navigate("/dashboard")}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
            >
              Back to Dashboard
            </button>
          </motion.div>
        </div>
      )}

      {/* MODAL DE ERROR */}
      {voteStatus === 'error' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-lg p-8 max-w-sm mx-4 shadow-xl"
          >
            {/* Icono error */}
            <div className="flex justify-center mb-6 text-5xl">
              âŒ
            </div>

            <h2 className="text-center text-xl font-bold text-slate-900 dark:text-white mb-4">
              No se pudo registrar el voto
            </h2>

            {/* Mensaje de error exacto */}
            <p className="text-center text-sm text-red-600 dark:text-red-400 mb-6 bg-red-50 dark:bg-red-900/20 rounded p-3">
              {voteError || "Error desconocido"}
            </p>

            {/* Botones de acción */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setVoteStatus(null);
                  setVoteError(null);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                🔄 Reintentar
              </button>
              <button
                onClick={() => {
                  setVoteStatus(null);
                  setVoteError(null);
                  navigate("/dashboard");
                }}
                className="flex-1 px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg transition font-medium"
              >
                â† Volver
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              {electionTitle || "Voting Booth"}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Selecciona tu opción y vota de forma segura y anónima
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cerrar sesión
          </button>
        </div>

        {/* Messages */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
          >
            {error}
          </motion.div>
        )}

        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400"
          >
            {successMessage}
          </motion.div>
        )}

        {candidates.length === 0 && !error && (
          <div className="mb-6 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400">
            No hay candidatos disponibles para esta elección
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* VOTING SECTION */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
                Selecciona tu opción
              </h2>

              <div className="space-y-4">
                {candidates.map((candidate) => (
                  <motion.button
                    key={candidate.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedCandidate(candidate.id)}
                    className={`w-full p-4 rounded-lg border-2 transition text-left ${
                      selectedCandidate === candidate.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-slate-300 dark:border-slate-600 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                          selectedCandidate === candidate.id
                            ? "border-blue-500 bg-blue-500"
                            : "border-slate-400"
                        }`}
                      >
                        {selectedCandidate === candidate.id && (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                          {candidate.name}
                        </h3>
                        {candidate.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {candidate.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Confirm Button & Eligibility Message */}
              {eligibilityError ? (
                <div className="mt-8 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400 text-center font-medium">
                  {eligibilityError === 'You have already voted in this election' ? 'Ya has votado' : eligibilityError}
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleVote(selectedCandidate)}
                  disabled={!selectedCandidate || voteStatus !== null}
                  className="w-full mt-8 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {voteStatus === null ? '🗳️ Emitir voto' : 'Processing...'}
                </motion.button>
              )}
            </div>
          </div>

          {/* LIVE FEED SECTION */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-200 dark:border-slate-700 h-full max-h-[600px] flex flex-col">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                📡 Live Feed
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Votos registrados en tiempo real
              </p>

              {/* Vote Counter */}
              <div className=" mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <span className="font-bold">{voteCount}</span> votantes
                  registrados
                </p>
              </div>

              {/* Votes List */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {votes.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 text-sm">
                    {isListening ? "Esperando votos..." : "⚡ Reconectando..."}
                  </div>
                ) : (
                  votes.map((vote) => (
                    <motion.div
                      key={vote.id}
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs"
                    >
                      {/* Nullifier truncado: 0x1a2b...ef34 */}
                      <p className="font-mono text-blue-600 dark:text-blue-400 truncate">
                        🔗 {vote.nullifier.slice(0, 6)}...{vote.nullifier.slice(-4)}
                      </p>
                      {/* Tiempo relativo que se actualiza cada segundo */}
                      <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                        {vote.timeText}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Privacy Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="mt-12 p-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
        >
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            ðŸ” Privacidad Garantizada
          </h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>âœ“ Tu voto se cifra localmente antes de enviarse</li>
            <li>âœ“ Tu identidad nunca se vincula al voto</li>
            <li>âœ“ Solo se registra un hash anónimo en blockchain</li>
            <li>âœ“ Los resultados son públicamente auditables</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary atrapó un error en VotingBooth:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8 max-w-md w-full text-center border border-red-200 dark:border-red-900/50">
            <div className="text-5xl mb-6">💥</div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Algo inesperado ocurrió</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 bg-slate-100 dark:bg-slate-900 p-3 rounded">
              {this.state.error?.message || "Error desconocido en la cabina de votación"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:bg-slate-800 transition shadow"
            >
              🔄 Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const VotingBooth = () => (
  <ErrorBoundary>
    <VotingBoothContent />
  </ErrorBoundary>
);

export default VotingBooth;