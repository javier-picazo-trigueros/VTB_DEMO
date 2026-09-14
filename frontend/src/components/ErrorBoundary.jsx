import { Component } from 'react'

/**
 * ErrorBoundary
 *
 * Captura errores no controlados durante el render de los componentes hijos
 * y muestra una pantalla de recuperación en vez de dejar la app en blanco.
 *
 * Debe ser un componente de clase: getDerivedStateFromError / componentDidCatch
 * no tienen equivalente en hooks — es la única forma de que React intercepte
 * errores de render.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Error capturado por ErrorBoundary:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/landing'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-warm-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8 border border-warm-200">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007v.008H12v-.008zM10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-slate-900 mb-1.5">
                Ha ocurrido un error inesperado
              </h1>
              <p className="text-sm text-slate-500 mb-6">
                La página no ha podido completarse. Recarga o vuelve al inicio — tu sesión y tus votos ya emitidos no se ven afectados.
              </p>

              {import.meta.env.DEV && this.state.error && (
                <details className="mt-2 mb-6 p-4 rounded bg-red-50 border border-red-200 text-left">
                  <summary className="cursor-pointer font-medium text-red-700 text-sm mb-2">
                    Detalle del error (solo en desarrollo)
                  </summary>
                  <pre className="text-xs text-red-700 overflow-auto max-h-48 p-2 bg-white rounded font-mono-vtb">
                    {this.state.error.toString()}
                  </pre>
                </details>
              )}

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-2.5 px-4 rounded bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors"
                >
                  Recargar página
                </button>
                <button
                  onClick={this.handleReset}
                  className="w-full py-2.5 px-4 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-colors"
                >
                  Volver al inicio
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
