/**
 * VTB - ElectionCard.jsx
 * ======================
 * Tarjeta que representa una elección.
 * Muestra información de la elección y botón para votar.
 */

export const ElectionCard = ({ election, onVote, disabled = false }) => {
  const statusBadgeColor = election.is_active 
    ? 'bg-emerald-500/20 text-emerald-400' 
    : 'bg-slate-700/50 text-slate-400'
  
  const statusText = election.is_active ? 'Votación Activa' : 'Votación Cerrada'

  return (
    <div className="bg-slate-800 border border-emerald-500/20 rounded-lg p-6 hover:border-emerald-500/50 transition hover:shadow-lg hover:shadow-emerald-500/10">
      {/* Encabezado */}
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-white flex-1 line-clamp-2">
          {election.title}
        </h3>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ml-4 ${statusBadgeColor}`}>
          {statusText}
        </span>
      </div>

      {/* Descripción */}
      {election.description && (
        <p className="text-slate-300 text-sm mb-4 line-clamp-2">
          {election.description}
        </p>
      )}

      {/* Candidatos */}
      {election.candidates && election.candidates.length > 0 && (
        <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
          <p className="text-xs text-emerald-400 font-semibold mb-2">Candidatos:</p>
          <div className="space-y-1">
            {election.candidates.map((candidate, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {idx + 1}
                </span>
                <span className="text-sm text-slate-200">{candidate.name || candidate}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Información adicional */}
      <div className="flex justify-between items-center mb-4 text-xs text-slate-400">
        <span>🗳️ {election.vote_count || 0} votos registrados</span>
        <span>📅 {new Date(election.created_at).toLocaleDateString('es-ES')}</span>
      </div>

      {/* Botón de acción */}
      <button
        onClick={() => onVote(election)}
        disabled={!election.is_active || disabled}
        className={`w-full py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
          election.is_active && !disabled
            ? 'bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
        }`}
      >
        {election.is_active && !disabled ? (
          <>
            🗳️ Votar
          </>
        ) : (
          <>
            🔒 Votación cerrada
          </>
        )}
      </button>
    </div>
  )
}

export default ElectionCard
