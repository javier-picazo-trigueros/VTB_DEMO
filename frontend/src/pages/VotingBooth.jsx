import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ethers } from "ethers";
import axios from "axios";
import { Navbar } from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const RPC_URL = import.meta.env.VITE_RPC_URL || "http://localhost:8545";
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

// ---------------------------------------------------------------------------
// Icons (inline SVG para no depender de librerías extra)
// ---------------------------------------------------------------------------
const CheckCircleIcon = () => (
  <svg className="w-12 h-12 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const XCircleIcon = () => (
  <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);
const SignalIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
  </svg>
);
const ClipboardIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
  </svg>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const truncateHash = (hash, start = 8, end = 6) =>
  hash ? `${hash.slice(0, start)}...${hash.slice(-end)}` : "";

const calculateTimeAgo = (timestamp, lang = "es") => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (lang === "es") {
    if (seconds < 60) return `hace ${seconds}s`;
    if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
    return `hace ${Math.floor(seconds / 3600)}h`;
  }
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

// ---------------------------------------------------------------------------
// Sub-componente: Spinner de progreso de voto
// ---------------------------------------------------------------------------
const VoteProgressModal = ({ status, t }) => {
  const steps = [
    { key: "proof",      label: t("votingBooth.calculateProof"), sub: t("votingBooth.preparingData") },
    { key: "sending",    label: t("votingBooth.sendingVote"),     sub: t("votingBooth.connectingBlockchain") },
    { key: "confirming", label: t("votingBooth.confirmingTx"),    sub: t("votingBooth.waitingConfirmation") },
  ];
  const current = steps.find(s => s.key === status);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700"
      >
        <div className="flex justify-center mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-14 h-14 rounded-full border-4 border-slate-200 dark:border-slate-600 border-t-blue-600"
          />
        </div>
        <h3 className="text-center text-lg font-semibold text-slate-900 dark:text-white mb-1">
          {current?.label}
        </h3>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          {current?.sub}
        </p>
        {/* Barra de progreso */}
        <div className="mt-6 flex gap-2 justify-center">
          {steps.map((s, i) => {
            const idx = steps.indexOf(current);
            return (
              <div
                key={s.key}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  i <= idx ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-600"
                }`}
              />
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-componente: Modal de éxito
// ---------------------------------------------------------------------------
const VoteSuccessModal = ({ txData, t, onDashboard, onViewResults, onCopy }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700"
    >
      <div className="flex justify-center mb-5">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.1 }}>
          <CheckCircleIcon />
        </motion.div>
      </div>
      <h2 className="text-center text-xl font-bold text-slate-900 dark:text-white mb-1">
        {t("votingBooth.voteRegistered")}
      </h2>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-5">
        {t("votingBooth.txHashLabel")}
      </p>

      {/* TxHash box */}
      <div className="bg-slate-900 dark:bg-slate-900 rounded-xl p-3 mb-4 font-mono text-xs text-cyan-400 break-all leading-relaxed">
        {txData.txHash}
      </div>

      <button
        onClick={onCopy}
        className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition font-medium text-sm"
      >
        <ClipboardIcon />
        {t("votingBooth.copyTxHash")}
      </button>

      <button
        onClick={onViewResults}
        className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-semibold"
      >
        {t("votingBooth.viewResults")}
      </button>

      <button
        onClick={onDashboard}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition font-medium text-sm"
      >
        {t("votingBooth.backToDashboard")}
      </button>
    </motion.div>
  </div>
);

// ---------------------------------------------------------------------------
// Sub-componente: Modal de error
// ---------------------------------------------------------------------------
const VoteErrorModal = ({ voteError, t, onRetry, onBack }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700"
    >
      <div className="flex justify-center mb-5">
        <XCircleIcon />
      </div>
      <h2 className="text-center text-xl font-bold text-slate-900 dark:text-white mb-3">
        {t("votingBooth.voteFailed")}
      </h2>
      <div className="text-center text-sm text-red-600 dark:text-red-400 mb-6 bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-100 dark:border-red-800">
        {typeof voteError === "string" ? voteError : voteError?.message || "Error desconocido"}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-semibold text-sm"
        >
          {t("votingBooth.retry")}
        </button>
        <button
          onClick={onBack}
          className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl transition font-semibold text-sm"
        >
          {t("votingBooth.back")}
        </button>
      </div>
    </motion.div>
  </div>
);

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export const VotingBoothContent = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id: electionId } = useParams();

  const [candidates, setCandidates] = useState([]);
  const [electionTitle, setElectionTitle] = useState("");
  const [votes, setVotes] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eligibilityError, setEligibilityError] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voteCount, setVoteCount] = useState(0);
  const [voteStatus, setVoteStatus] = useState(null); // null | 'proof' | 'sending' | 'confirming' | 'success' | 'error'
  const [txData, setTxData] = useState(null);
  const [voteError, setVoteError] = useState(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [copied, setCopied] = useState(false);

  // Cargar datos de la elección y verificar elegibilidad
  useEffect(() => {
    const token = localStorage.getItem("vtb-token");
    if (!token) { navigate("/login"); return; }
    if (!electionId) { setError(t("errors.invalidElection")); setLoading(false); return; }
    loadElectionData();
  }, [electionId]);

  const loadElectionData = async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("vtb-token");
    if (!token) { navigate("/login"); return; }

    try {
      // 1. Verificar elegibilidad
      try {
        const eligRes = await axios.get(`${API_URL}/api/elections/${electionId}/eligibility`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!eligRes.data.eligible) {
          const reason = eligRes.data.reason;
          if (reason === "already_voted") {
            setAlreadyVoted(true);
          } else {
            const msgs = {
              not_active:  t("errors.electionNotActive"),
              not_eligible: t("errors.notInCensus"),
            };
            setEligibilityError(msgs[reason] || t("errors.unauthorized"));
          }
        }
      } catch (eligErr) {
        console.error("Error checking eligibility:", eligErr);
      }

      // 2. Obtener candidatos
      const { data } = await axios.get(`${API_URL}/api/elections/${electionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!data?.election) {
        setError(t("errors.electionNotFound"));
        setLoading(false);
        return;
      }

      const election = data.election;
      setElectionTitle(election.name || "");
      setCandidates(Array.isArray(election.candidates) ? election.candidates : []);
    } catch (err) {
      console.error("Error loading election:", err);
      if (err.response?.status === 401) { navigate("/login"); return; }
      setError(err.response?.data?.error || t("errors.loadingElections"));
    } finally {
      setLoading(false);
    }
  };

  // Escucha de eventos blockchain
  useEffect(() => {
    if (!CONTRACT_ADDRESS || !RPC_URL) return;

    let contract = null;
    let interval = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 3;

    const setupListener = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contractAbi = ["event VoteCast(uint256 indexed electionId, bytes32 nullifier, bytes32 voteHash)"];
        contract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, provider);
        setIsListening(true);
        reconnectAttempts = 0;

        contract.on("VoteCast", (eId, nullifier) => {
          if (eId.toString() !== electionId?.toString()) return;
          const now = Date.now();
          setVotes(prev => [
            { id: now + Math.random(), nullifier, createdAt: now, timeText: calculateTimeAgo(now, i18n.language) },
            ...prev,
          ].slice(0, 8));
          setVoteCount(prev => prev + 1);
        });
      } catch {
        setIsListening(false);
        if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          setTimeout(setupListener, 5000);
        }
      }
    };

    setupListener();

    interval = setInterval(() => {
      setVotes(prev => prev.map(v => ({ ...v, timeText: calculateTimeAgo(v.createdAt, i18n.language) })));
    }, 1000);

    return () => {
      contract?.removeAllListeners("VoteCast");
      clearInterval(interval);
    };
  }, [electionId, i18n.language]);

  // Enviar voto
  const handleVote = async () => {
    if (!selectedCandidate || !electionId) return;
    const token = localStorage.getItem("vtb-token");
    if (!token) { navigate("/login"); return; }

    try {
      setVoteStatus("proof");
      await new Promise(r => setTimeout(r, 800));

      const voteHash = ethers.keccak256(
        ethers.toUtf8Bytes(`${selectedCandidate}-${Date.now()}-${Math.random()}`)
      );

      setVoteStatus("sending");
      const response = await axios.post(
        `${API_URL}/api/elections/register-vote`,
        { electionId: parseInt(electionId), voteHash, candidateId: selectedCandidate },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      setVoteStatus("confirming");
      await new Promise(r => setTimeout(r, 600));

      setTxData({ txHash: response.data.txHash });
      setVoteStatus("success");
      setSelectedCandidate(null);
    } catch (err) {
      console.error("Vote error:", err);
      const isBlockchainErr =
        err.response?.status === 500 &&
        (err.response?.data?.error?.toLowerCase().includes("blockchain") ||
         err.response?.data?.error?.toLowerCase().includes("provider"));

      if (isBlockchainErr) {
        setVoteError({ type: "blockchain_unavailable", message: t("votingBooth.blockchainUnavailable"), detail: t("votingBooth.blockchainUnavailableDetail") });
      } else {
        setVoteError(err.response?.data?.error || err.message || t("votingBooth.error"));
      }
      setVoteStatus("error");
      if (err.response?.status === 401) setTimeout(() => navigate("/login"), 2000);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  // ----- Render: loading -----
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Navbar />
        <div className="flex items-center justify-center min-h-[calc(100vh-70px)]">
          <LoadingSpinner message={t("loading")} />
        </div>
      </div>
    );
  }

  const inProgress = voteStatus && voteStatus !== "success" && voteStatus !== "error";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

      {/* ---------- Modales ---------- */}
      {inProgress && <VoteProgressModal status={voteStatus} t={t} />}

      {voteStatus === "success" && txData && (
        <VoteSuccessModal
          txData={txData}
          t={t}
          onDashboard={() => navigate("/dashboard")}
          onViewResults={() => navigate(`/results/${electionId}`)}
          onCopy={() => copyToClipboard(txData.txHash)}
        />
      )}

      {voteStatus === "error" && !voteError?.type && (
        <VoteErrorModal
          voteError={voteError}
          t={t}
          onRetry={() => { setVoteStatus(null); setVoteError(null); }}
          onBack={() => { setVoteStatus(null); setVoteError(null); navigate("/dashboard"); }}
        />
      )}

      {/* ---------- Contenido ---------- */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 mb-4 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            {t("votingBooth.backToDashboard")}
          </button>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{electionTitle || t("votingBooth.title")}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{t("votingBooth.anonymousInfo")}</p>
        </motion.div>

        {/* Estado: ya votado */}
        {alreadyVoted && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="mb-8 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-2xl p-8 text-center"
          >
            <div className="flex justify-center mb-3"><CheckCircleIcon /></div>
            <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mb-1">{t("votingBooth.alreadyVoted")}</h3>
            <p className="text-emerald-600 dark:text-emerald-400 text-sm mb-5">{t("votingBooth.alreadyVotedDesc")}</p>
            <button
              onClick={() => navigate(`/results/${electionId}`)}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition text-sm"
            >
              {t("votingBooth.viewResults")}
            </button>
          </motion.div>
        )}

        {/* Error de blockchain no disponible */}
        {voteError?.type === "blockchain_unavailable" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">{voteError.message}</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1 font-mono">{voteError.detail}</p>
                <button
                  onClick={() => { setVoteError(null); setVoteStatus(null); handleVote(); }}
                  className="mt-3 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition"
                >
                  {t("votingBooth.retryVote")}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error general */}
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 text-sm"
          >
            {error}
          </motion.div>
        )}

        {!alreadyVoted && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* ---- Panel de votación ---- */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="lg:col-span-2"
            >
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Cabecera del panel */}
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    {t("votingBooth.selectYourOption")}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {candidates.length} {candidates.length === 1 ? "candidato" : "candidatos"}
                  </p>
                </div>

                <div className="p-6">
                  {/* Sin candidatos */}
                  {candidates.length === 0 && !error && (
                    <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                      <svg className="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Sin candidatos disponibles
                    </div>
                  )}

                  {/* Lista de candidatos */}
                  <div className="space-y-3">
                    {candidates.map((candidate) => {
                      const selected = selectedCandidate === candidate.id;
                      return (
                        <motion.button
                          key={candidate.id}
                          whileHover={{ scale: eligibilityError ? 1 : 1.01 }}
                          whileTap={{ scale: eligibilityError ? 1 : 0.99 }}
                          onClick={() => !eligibilityError && setSelectedCandidate(candidate.id)}
                          disabled={!!eligibilityError}
                          className={`w-full p-4 rounded-xl border-2 transition-all text-left group ${
                            selected
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm"
                              : eligibilityError
                              ? "border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed"
                              : "border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {/* Radio circle */}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              selected ? "border-blue-500 bg-blue-500" : "border-slate-300 dark:border-slate-500"
                            }`}>
                              {selected && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-sm transition-colors ${
                                selected ? "text-blue-700 dark:text-blue-300" : "text-slate-800 dark:text-white"
                              }`}>
                                {candidate.name}
                              </p>
                              {candidate.description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                  {candidate.description}
                                </p>
                              )}
                            </div>
                            {selected && (
                              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </motion.div>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Mensaje de no elegibilidad */}
                  {eligibilityError && (
                    <div className="mt-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                      <p className="text-sm text-amber-700 dark:text-amber-300 font-medium text-center">{eligibilityError}</p>
                    </div>
                  )}

                  {/* Botón de emitir voto */}
                  {!eligibilityError && (
                    <div className="mt-6">
                      <motion.button
                        whileHover={{ scale: selectedCandidate ? 1.01 : 1 }}
                        whileTap={{ scale: selectedCandidate ? 0.99 : 1 }}
                        onClick={handleVote}
                        disabled={!selectedCandidate || voteStatus !== null}
                        className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
                          selectedCandidate && !voteStatus
                            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {voteStatus
                          ? t("votingBooth.processing")
                          : selectedCandidate
                          ? t("votingBooth.castVote")
                          : t("votingBooth.selectOption")}
                      </motion.button>
                      {!selectedCandidate && (
                        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-2">
                          {t("votingBooth.selectOption")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* ---- Live Feed ---- */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="lg:col-span-1 flex flex-col gap-4"
            >
              {/* Contador */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{voteCount}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t("votingBooth.votersRegistered")}</p>
                  </div>
                  <div className={`p-2 rounded-full ${isListening ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-slate-100 dark:bg-slate-700"}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${isListening ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                  </div>
                </div>
              </div>

              {/* Feed */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex-1">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                  <SignalIcon />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{t("liveFeed.title")}</span>
                </div>
                <div className="p-3 max-h-64 overflow-y-auto space-y-2">
                  {votes.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      {isListening ? t("votingBooth.waitingVotes") : t("votingBooth.reconnecting")}
                    </div>
                  ) : (
                    votes.map(vote => (
                      <motion.div
                        key={vote.id}
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/60 rounded-lg"
                      >
                        <span className="font-mono text-xs text-blue-600 dark:text-blue-400 truncate mr-2">
                          {truncateHash(vote.nullifier, 6, 4)}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          {vote.timeText}
                        </span>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              {/* Privacy card */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 text-blue-700 dark:text-blue-300">
                  <ShieldIcon />
                  <span className="text-sm font-semibold">{t("votingBooth.privacyTitle")}</span>
                </div>
                <ul className="space-y-1.5">
                  {[
                    t("votingBooth.privacyEncrypted"),
                    t("votingBooth.privacyAnonymous"),
                    t("votingBooth.privacyHash"),
                    t("votingBooth.privacyAuditable"),
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
                      <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
};

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("VotingBooth error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-red-200 dark:border-red-900/50">
            <div className="flex justify-center mb-4"><XCircleIcon /></div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Algo inesperado ocurrió</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 bg-slate-100 dark:bg-slate-900 p-3 rounded-xl">
              {this.state.error?.message || "Error desconocido en la cabina de votación"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
            >
              Recargar página
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
