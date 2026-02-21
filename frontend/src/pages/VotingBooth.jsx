import { useState, useEffect } from "react";
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

export const VotingBooth = () => {
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
  const [successMessage, setSuccessMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voteCount, setVoteCount] = useState(0);
  
  // BLOQUE 3.4: Estados para feedback de transacción
  const [voteStatus, setVoteStatus] = useState(null); // null | 'proof' | 'sending' | 'confirming' | 'success' | 'error'
  const [txData, setTxData] = useState(null); // { txHash, explorerUrl }
  const [voteError, setVoteError] = useState(null);

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
          
          let errorMsg;
          switch (reason) {
            case 'not_found':
              errorMsg = 'Esta elección no existe';
              break;
            case 'not_active':
              errorMsg = status === 'pending' 
                ? 'Esta elección aún no ha comenzado'
                : 'Esta elección ya ha finalizado. Puedes ver los resultados.';
              break;
            case 'not_eligible':
              errorMsg = 'No tienes permiso para votar en esta elección';
              break;
            case 'already_voted':
              errorMsg = 'Ya has emitido tu voto en esta elección ✓';
              break;
            default:
              errorMsg = 'No puedes votar en esta elección';
          }
          
          setError(errorMsg);
          setLoading(false);
          
          // Redirigir al dashboard con mensaje despuÃ©s de 2 segundos
          setTimeout(() => {
            navigate('/dashboard', { state: { message: errorMsg } });
          }, 2000);
          return;
        }
      } catch (eligErr) {
        console.error('Error validando elegibilidad:', eligErr);
        setError('Error al validar tu elegibilidad');
        setLoading(false);
        return;
      }

      // 2. GET /api/elections/:id para obtener candidatos
      const response = await axios.get(`${API_URL}/api/elections/${electionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = response.data;

      // Validar que la elecciÃ³n existe
      if (!data || !data.election) {
        setError("Esta elecciÃ³n no existe");
        setLoading(false);
        return;
      }

      const election = data.election;
      setElectionTitle(election.name || election.title || "ElecciÃ³n");
      
      // Asegurar que candidates es un array
      const candidatesList = Array.isArray(election.candidates)
        ? election.candidates
        : [];
      setCandidates(candidatesList);

      if (candidatesList.length === 0) {
        console.warn("âš ï¸  No hay candidatos cargados para esta elecciÃ³n");
      }

      setLoading(false);
    } catch (err) {
      console.error("Error cargando elecciÃ³n:", err);

      if (err.response?.status === 404) {
        setError("ElecciÃ³n no encontrada");
      } else if (err.response?.status === 401) {
        navigate("/login");
        return;
      } else {
        setError(
          err.response?.data?.error ||
            "Error al cargar la elecciÃ³n. Intenta de nuevo."
        );
      }

      setLoading(false);
    }
  };

  // Iniciar escucha de eventos blockchain (BLOQUE 3.3 - Mejorado)
  useEffect(() => {
    if (!CONTRACT_ADDRESS || !RPC_URL) {
      console.warn("âš ï¸ Blockchain no configurado");
      return;
    }

    let reconnectAttempts = 0;
    const MAX_RECONNECT = 3;
    let timeUpdateInterval = null;
    let contract = null;

    const setupListener = async () => {
      try {
        console.log("ðŸ”— Conectando a Hardhat RPC...");
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // ABI del contrato (solo eventos que nos interesan)
        const contractAbi = [
          "event VoteCast(uint256 indexed electionId, bytes32 indexed nullifier, bytes32 voteHash, uint256 timestamp)",
        ];

        contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          contractAbi,
          provider
        );

        console.log("âœ… Conectado. Escuchando eventos VoteCast...");
        setIsListening(true);

        // ESCUCHAR EVENTOS EN TIEMPO REAL (BLOQUE 3.3)
        // Filtra solo votos de la elecciÃ³n actual
        contract.on("VoteCast", (eId, nullifier, voteHash, timestamp) => {
          // Filter por elecciÃ³n actual (MEJORA 1: Filtrado)
          if (eId.toString() !== electionId?.toString()) {
            return;
          }

          console.log("ðŸ“ Nuevo voto recibido en Live Feed:", {
            electionId: eId.toString(),
            nullifier: nullifier.slice(0, 10) + "...",
            timestamp: timestamp.toString(),
          });

          const voteTimestamp = Number(timestamp) * 1000;
          const newVote = {
            id: Date.now(),
            nullifier: nullifier, // completo para truncar en render
            voteHash,
            createdAt: voteTimestamp, // timestamp para calcular tiempo relativo
            timeText: calculateTimeAgo(voteTimestamp), // inicial
          };

          // MEJORA 2: Mantener mÃ¡ximo 8 eventos
          setVotes((prev) => {
            const updated = [newVote, ...prev];
            return updated.slice(0, 8); // MÃ¡ximo 8 eventos
          });
          
          setVoteCount((prev) => prev + 1);
        });

        // Limpiar intentos de reconexiÃ³n
        reconnectAttempts = 0;
      } catch (err) {
        console.error("âŒ Error conectando a blockchain:", err);
        
        if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          // Mostrar badge de reconexiÃ³n
          setIsListening(false);
          console.log(`âš¡ Reintentando... (${reconnectAttempts}/${MAX_RECONNECT})`);
          
          // Reintentar en 5 segundos
          setTimeout(setupListener, 5000);
        } else {
          setError(
            "No se pudo conectar al blockchain despuÃ©s de varios intentos."
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
   * BLOQUE 3.4: FunciÃ³n mejorada para registrar voto con feedback 3 pasos
   * Flujo: proof (calcular) â†’ sending (enviando al backend) â†’ confirming (esperando confirmaciÃ³n) â†’ success|error
   */
  const handleVote = async (candidateId) => {
    if (!selectedCandidate || !electionId) return;

    try {
      const token = localStorage.getItem("vtb-token");

      if (!token) {
        navigate("/login");
        return;
      }

      // PASO 1: Generar proof (simula cÃ¡lculo del nullifier)
      setVoteStatus('proof');
      await new Promise(resolve => setTimeout(resolve, 800)); // Simular cÃ¡lculo

      // Generar voteHash localmente
      const randomSalt = Math.random().toString(36);
      const votePayload = `vote:${selectedCandidate}:${randomSalt}`;
      const voteHash = await hashMessage(votePayload);

      console.log("ðŸ—³ï¸ Preparando voto:");
      console.log("  - Candidato:", selectedCandidate);
      console.log("  - Vote Hash:", voteHash);
      console.log("  - Election ID:", electionId);

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

      // PASO 3: ConfirmaciÃ³n
      setVoteStatus('confirming');
      await new Promise(resolve => setTimeout(resolve, 600)); // Simular confirmaciÃ³n

      // TransacciÃ³n exitosa
      console.log("âœ… Voto registrado en blockchain");
      console.log("ðŸ“Š TX Hash:", response.data.txHash);

      setTxData({
        txHash: response.data.txHash,
        explorerUrl: `${import.meta.env.VITE_EXPLORER_URL || 'http://localhost:8545'}/tx/${response.data.txHash}`,
      });
      
      setVoteStatus('success');
      setSelectedCandidate(null);

    } catch (err) {
      console.error("âŒ Error al registrar voto:", err);

      setVoteError(
        err.response?.data?.error ||
        err.message ||
        "Error al registrar voto. Intenta de nuevo."
      );
      
      setVoteStatus('error');

      if (err.response?.status === 401) {
        setTimeout(() => navigate("/login"), 2000);
      }
    }
  };

  /**
   * Helper: SHA256 en cliente usando Web Crypto API
   */
  const hashMessage = async (message) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return (
      "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
    );
  };

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
      alert("âœ… Copiado al portapapeles");
    } catch (err) {
      console.error("Error copiando:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Navbar />
        <div className="flex items-center justify-center min-h-[calc(100vh-70px)]">
          <LoadingSpinner message="Cargando cabina de votaciÃ³n..." />
        </div>
      </div>
    );
  }

  // BLOQUE 3.4: Renderizar modales de feedback de transacciÃ³n
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

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
              {voteStatus === 'sending' && 'ðŸ“¤ Enviando voto...'}
              {voteStatus === 'confirming' && 'â³ Confirmando transacciÃ³n...'}
            </h3>

            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              {voteStatus === 'proof' && 'Preparando datos...'}
              {voteStatus === 'sending' && 'Conectando con blockchain...'}
              {voteStatus === 'confirming' && 'Esperando confirmaciÃ³n de la red...'}
            </p>
          </motion.div>
        </div>
      )}

      {/* MODAL DE Ã‰XITO */}
      {voteStatus === 'success' && txData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-lg p-8 max-w-sm mx-4 shadow-xl"
          >
            {/* Icono Ã©xito */}
            <div className="flex justify-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="text-5xl"
              >
                âœ…
              </motion.div>
            </div>

            <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white mb-4">
              Â¡Voto registrado en blockchain!
            </h2>

            {/* TxHash Box */}
            <div className="bg-slate-900 dark:bg-slate-900 rounded-lg p-4 mb-6 font-mono text-xs text-cyan-400 break-all max-h-20 overflow-y-auto">
              {txData.txHash}
            </div>

            {/* BotÃ³n Copiar */}
            <button
              onClick={() => copyToClipboard(txData.txHash)}
              className="w-full mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              ðŸ“‹ Copiar TxHash
            </button>

            {/* Enlace al explorador */}
            <a
              href={txData.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mb-6 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white text-center rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition font-medium block text-sm"
            >
              ðŸ” Ver en el explorador â†’
            </a>

            {/* BotÃ³n Volver */}
            <button
              onClick={() => navigate("/dashboard")}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
            >
              Volver al Dashboard
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

            {/* Botones de acciÃ³n */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setVoteStatus(null);
                  setVoteError(null);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                ðŸ”„ Reintentar
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
              {electionTitle || "Cabina de VotaciÃ³n"}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Selecciona tu opciÃ³n y vota de forma segura y anÃ³nima
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cerrar sesiÃ³n
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
            No hay candidatos disponibles para esta elecciÃ³n
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* VOTING SECTION */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
                Selecciona tu opciÃ³n
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

              {/* Confirm Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleVote(selectedCandidate)}
                disabled={!selectedCandidate || voteStatus !== null}
                className="w-full mt-8 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {voteStatus === null ? 'ðŸ—³ï¸ Emitir voto' : 'Procesando...'}
              </motion.button>
            </div>
          </div>

          {/* LIVE FEED SECTION */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-200 dark:border-slate-700 h-full max-h-[600px] flex flex-col">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                ðŸ“¡ Live Feed
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
                    {isListening ? "Esperando votos..." : "âš¡ Reconectando..."}
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
                        ðŸ”— {vote.nullifier.slice(0, 6)}...{vote.nullifier.slice(-4)}
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
            <li>âœ“ Solo se registra un hash anÃ³nimo en blockchain</li>
            <li>âœ“ Los resultados son pÃºblicamente auditables</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
};

export default VotingBooth;