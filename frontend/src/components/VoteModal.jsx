/**
 * VTB - VoteModal.jsx
 * ====================
 * Modal para realizar la votación.
 * 
 * Flujo:
 * 1. Usuario selecciona candidato
 * 2. Se genera credencial anónima (simulada)
 * 3. Se envía voto a blockchain
 * 4. Se muestra recibo con hash de transacción
 */

import { useState } from 'react'
import { Spinner } from './Spinner'

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const VoteModal = ({ election, user, onClose, onSuccess }) => {
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState(null)

  /**
   * Realiza el voto en la blockchain.
   */
  const handleSubmitVote = async () => {
    if (!selectedCandidate) {
      setError('Debes seleccionar un candidato')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Enviar voto al backend
      const response = await fetch(`${API_URL}/elections/register-vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          electionId: election.id,
          candidateId: selectedCandidate,
          voteHash: user.id,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error al registrar voto')
      }

      const data = await response.json()
      setReceipt(data)
      
      // Notificar al componente padre
      setTimeout(() => {
        onSuccess && onSuccess()
      }, 3000)
    } catch (err) {
      setError(err.message)
      console.error('Error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // === ESTADO: Recibo (Éxito) ===
  if (receipt) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-xl border border-emerald-500/30 max-w-2xl w-full p-8 max-h-96 overflow-y-auto">
          {/* Encabezado */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">✓</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">¡Voto Registrado!</h2>
            <p className="text-emerald-400">Tu voto ha sido registrado en la blockchain de forma inmutable y anónima.</p>
          </div>

          {/* Detalles del recibo */}
          <div className="bg-slate-900/50 rounded-lg p-4 space-y-3 mb-6 border border-slate-700">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Hash de Transacción (Recibo)</p>
              <p className="text-emerald-400 font-mono text-sm break-all mt-1 select-all">
                {receipt.tx_hash}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Guarda este hash para auditoría. Prueba que tu voto fue contado sin revelar por quién votaste.
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Credencial Anónima</p>
              <p className="text-slate-200 font-mono text-sm mt-1">
                {receipt.receipt.anonymous_credential}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Identificador único para tu voto (no vinculado a tu identidad).
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Elección</p>
              <p className="text-slate-200 text-sm mt-1">{election.title}</p>
            </div>

            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Timestamp</p>
              <p className="text-slate-200 text-sm mt-1">
                {new Date(receipt.receipt.timestamp).toLocaleString('es-ES')}
              </p>
            </div>
          </div>

          {/* Información importante */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-200">
              <strong>💡 Nota:</strong> Tu voto es <strong>anónimo</strong> en la blockchain. Solo el administrador del sistema 
              puede verificar que votaste (mediante SQL), pero <strong>no puede saber por quién votaste</strong>.
            </p>
          </div>

          {/* Botón */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg transition"
          >
            Cerrar y volver
          </button>
        </div>
      </div>
    )
  }

  // === ESTADO: Cargando ===
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl border border-emerald-500/30 p-12">
          <Spinner message="Generando credencial anónima y encriptando voto..." />
          <p className="text-center text-slate-300 text-sm mt-6">Esto simula el proceso de Zero-Knowledge Proof</p>
        </div>
      </div>
    )
  }

  // === ESTADO: Formulario de votación ===
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-emerald-500/30 max-w-2xl w-full p-8">
        {/* Encabezador */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">
            🗳️ Emitir Tu Voto
          </h2>
          <p className="text-slate-400">{election.title}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Lista de candidatos */}
        <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
          {election.candidates && election.candidates.map((candidate, idx) => {
            const candidateName = typeof candidate === 'string' ? candidate : candidate.name
            const candidateDesc = typeof candidate === 'string' ? '' : candidate.description
            
            return (
              <label
                key={idx}
                className={`block p-4 rounded-lg border cursor-pointer transition ${
                  selectedCandidate === candidateName
                    ? 'bg-emerald-500/10 border-emerald-500'
                    : 'bg-slate-900/50 border-slate-700 hover:border-emerald-500/30'
                }`}
              >
                <div className="flex items-start gap-4">
                  <input
                    type="radio"
                    name="candidate"
                    value={candidateName}
                    checked={selectedCandidate === candidateName}
                    onChange={(e) => setSelectedCandidate(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-white">{candidateName}</p>
                    {candidateDesc && (
                      <p className="text-sm text-slate-400 mt-1">{candidateDesc}</p>
                    )}
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Información de privacidad */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-emerald-200 font-medium mb-2">🔐 Protección de Privacidad:</p>
          <ul className="text-xs text-slate-300 space-y-1 ml-4">
            <li>✓ Se generará una credencial anónima (simulación de ZK-Proof)</li>
            <li>✓ Tu voto será encriptado y añadido a la blockchain</li>
            <li>✓ Recibirás un hash de transacción para auditoría</li>
            <li>✓ Tu identidad no estará vinculada a tu voto</li>
          </ul>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-lg border border-slate-600 text-slate-300 font-semibold hover:border-slate-500 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmitVote}
            disabled={!selectedCandidate}
            className={`flex-1 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
              selectedCandidate
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            ⛓️ Registrar Voto en Blockchain
          </button>
        </div>
      </div>
    </div>
  )
}

export default VoteModal
