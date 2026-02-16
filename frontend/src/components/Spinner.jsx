/**
 * VTB - Spinner.jsx
 * ==================
 * Componente de carga animado (spinner).
 * Usado para simular el proceso de votación/criptografía.
 */

export const Spinner = ({ size = 'md', message = 'Procesando...' }) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className={`${sizeClasses[size]} border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin`} />
      <p className="text-slate-300 text-sm">{message}</p>
    </div>
  )
}

export default Spinner
