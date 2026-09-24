/**
 * Pestaña "Registro de acciones" del panel de administración (SCRUM-20).
 *
 * Muestra admin_action_log: quién hizo qué, sobre qué, con qué resultado y
 * cuándo. El filtrado por dominio lo hace el servidor (GET /admin/action-log):
 * aquí no se decide nada de lo que cada administrador puede ver. La IP solo
 * llega en la respuesta para un superadministrador, así que la columna solo
 * aparece cuando viene.
 *
 * Va en su propio fichero y carga sus propios datos: AdminPanel.jsx ya pasa de
 * 2.300 líneas.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../utils/apiClient'

const PAGE_SIZE = 25

/**
 * Patrón de ruta → clave de traducción. Una ruta que no esté aquí se muestra
 * con su patrón tal cual: se ve menos bonita, pero no se pierde. El test
 * backend/src/__tests__/admin-action-log.test.ts comprueba que todas las
 * rutas de escritura de /admin tienen nombre aquí.
 */
const ACTION_LABELS = {
  'POST /admin/users': 'createUser',
  'POST /admin/users/import': 'importUsers',
  'PATCH /admin/users/:id/approval': 'userApproval',
  'DELETE /admin/users/:id': 'deleteUser',
  'POST /admin/org-units': 'createOrgUnit',
  'POST /admin/domain-admins': 'createDomainAdmin',
  'PATCH /admin/registration-requests/:id': 'reviewRequest',
  'POST /admin/elections': 'createElection',
  'PUT /admin/elections/:id': 'updateElection',
  'PATCH /admin/elections/:id': 'updateElection',
  'POST /admin/elections/:id/image': 'uploadImage',
  'POST /admin/elections/:id/domains': 'addDomain',
  'POST /admin/elections/:id/voters': 'addVoter',
  'POST /admin/elections/:id/candidates': 'addCandidate',
  'POST /admin/elections/:id/import-voters': 'importVoters',
  'POST /admin/elections/:id/notify-open': 'notifyOpen',
  'POST /admin/elections/:id/notify-close': 'notifyClose',
  'POST /api/admin/sync-blockchain': 'syncBlockchain',
}

const ENTITY_TYPES = ['election', 'user', 'org_unit', 'registration_request', 'domain', 'blockchain_sync']

const inputCls =
  'px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm'

export function ActionLogTab() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [appliedId, setAppliedId] = useState('')
  // El resultado recuerda para qué consulta es. "Cargando" no es un estado que
  // se ponga a mano: es que el último resultado no corresponde a la consulta
  // actual. Así el efecto solo toca el estado cuando responde el servidor.
  const [result, setResult] = useState({ query: null, entries: [], total: 0, error: '' })

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (entityType) params.set('entityType', entityType)
    if (appliedId) params.set('entityId', appliedId)
    return params.toString()
  }, [page, entityType, appliedId])

  useEffect(() => {
    let cancelled = false
    api.get(`/admin/action-log?${query}`)
      .then((res) => {
        if (!cancelled) setResult({ query, entries: res.data.entries, total: res.data.total, error: '' })
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ query, entries: [], total: 0, error: err.response?.data?.error || t('admin.actionLog.loadError') })
        }
      })
    return () => { cancelled = true }
  }, [query, t])

  const loading = result.query !== query
  const { entries, total, error } = result
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showIp = entries.some((e) => 'ip' in e)
  const actionLabel = (action) =>
    ACTION_LABELS[action] ? t(`admin.actionLog.actions.${ACTION_LABELS[action]}`) : action
  const formatDate = (iso) => new Date(iso).toLocaleString(i18n.language?.startsWith('en') ? 'en-GB' : 'es-ES')

  const applyIdFilter = (e) => {
    e.preventDefault()
    setPage(1)
    setAppliedId(entityId.trim())
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{t('admin.actionLog.intro')}</p>
        <form onSubmit={applyIdFilter} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="sr-only" htmlFor="action-log-type">{t('admin.actionLog.filterType')}</label>
          <select
            id="action-log-type"
            value={entityType}
            onChange={(e) => { setPage(1); setEntityType(e.target.value) }}
            className={inputCls}
          >
            <option value="">{t('admin.actionLog.allTypes')}</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>{t(`admin.actionLog.entities.${type}`)}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="action-log-id">{t('admin.actionLog.filterId')}</label>
          <input
            id="action-log-id"
            type="text"
            inputMode="numeric"
            placeholder={t('admin.actionLog.filterId')}
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className={inputCls}
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium">
            {t('admin.actionLog.apply')}
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <div className="flex items-baseline justify-between mb-4 gap-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('admin.actionLog.title')}</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">{t('admin.actionLog.count', { count: total })}</span>
        </div>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('admin.actionLog.loading')}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('admin.actionLog.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600 text-left text-slate-700 dark:text-slate-300">
                <th scope="col" className="py-2 px-3">{t('admin.actionLog.columns.when')}</th>
                <th scope="col" className="py-2 px-3">{t('admin.actionLog.columns.who')}</th>
                <th scope="col" className="py-2 px-3">{t('admin.actionLog.columns.action')}</th>
                <th scope="col" className="py-2 px-3">{t('admin.actionLog.columns.target')}</th>
                <th scope="col" className="py-2 px-3">{t('admin.actionLog.columns.result')}</th>
                {showIp && <th scope="col" className="py-2 px-3">IP</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 dark:border-slate-700/60 align-top">
                  <td className="py-2 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDate(e.createdAt)}</td>
                  <td className="py-2 px-3 text-slate-900 dark:text-white">
                    <div>{e.actor.name || `#${e.actor.id}`}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {e.actor.email} · {e.actor.role}{e.actor.domain ? ` · @${e.actor.domain}` : ''}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-900 dark:text-white">
                    <div>{actionLabel(e.action)}</div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{e.action}</div>
                  </td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                    {e.entityType ? `${t(`admin.actionLog.entities.${e.entityType}`, e.entityType)}${e.entityId ? ` #${e.entityId}` : ''}` : '—'}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${e.succeeded
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}
                    >
                      {e.succeeded ? t('admin.actionLog.ok') : t('admin.actionLog.failed')} · {e.statusCode}
                    </span>
                  </td>
                  {showIp && <td className="py-2 px-3 font-mono text-xs text-slate-600 dark:text-slate-400">{e.ip || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-end gap-3 mt-4 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-200 disabled:opacity-40"
            >
              {t('admin.actionLog.prev')}
            </button>
            <span className="text-slate-600 dark:text-slate-400">{t('admin.actionLog.page', { page, pages })}</span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-200 disabled:opacity-40"
            >
              {t('admin.actionLog.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
