import { useState, useEffect, useRef } from 'react'
import {
  CircleCheck, Mail, Clipboard, Terminal, Search, Loader2, Plus, Trash2,
  CircleX, Clock, CircleAlert, LogIn, LogOut, Home, User, Briefcase, Bell,
  LayoutPanelLeft, ChevronRight, EllipsisVertical, Calendar, Send, Settings
} from 'lucide-react'
import { logJiraWorklog, formatReportEmail, formatActivitySnippet, getWeekDays, searchJiraIssues, validateJiraConnection } from './services/reportService'
import { useMsal, useIsAuthenticated } from "@azure/msal-react"
import { loginRequest, sendOutlookEmail } from './services/outlookService'

function ActivityRow({ index, activity, updateActivity, removeActivity, config }) {
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const autocompleteRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      try {
        if (activity.issueKey.length >= 2) {
          setSearching(true)
          const results = await searchJiraIssues(config.jiraEmail, config.jiraToken, activity.issueKey)
          setSuggestions(results)
          setShowSuggestions(results.length > 0)
          setSearching(false)
        } else {
          setSuggestions([])
          setShowSuggestions(false)
        }
      } catch (e) {
        setSearching(false)
      }
    }, 500)
    return () => clearTimeout(delayDebounceFn)
  }, [activity.issueKey, config.jiraEmail, config.jiraToken])

  const selectSuggestion = (suggestion) => {
    updateActivity(index, { ...activity, issueKey: suggestion.key })
    setShowSuggestions(false)
  }

  return (
    <div className="card fade-in" style={{ marginBottom: '1rem', borderStyle: 'solid' }}>
      <div className="card-header" style={{ background: '#fcfdfe', padding: '0.5rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
          <Briefcase size={16} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            ACTIVIDAD #{index + 1}
          </span>
        </div>
        {index > 0 && (
          <button className="btn-icon" onClick={() => removeActivity(index)} style={{ color: '#E74C3C' }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="card-body" style={{ padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 100px', gap: '1rem', marginBottom: '1rem' }}>
          <div className="input-group" ref={autocompleteRef}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Ej: LAT-123"
                value={activity.issueKey}
                onChange={(e) => updateActivity(index, { ...activity, issueKey: e.target.value })}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              />
              {searching && (
                <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--latinia-teal)' }}>
                  <Loader2 size={16} className="spin" />
                </div>
              )}
              {showSuggestions && (
                <div className="autocomplete-list">
                  {suggestions.map((s, i) => (
                    <div key={i} className="autocomplete-item" onClick={() => selectSuggestion(s)}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--latinia-teal)' }}>{s.key}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="input-group">
            <label>Horas</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={activity.hours}
              onChange={(e) => updateActivity(index, { ...activity, hours: e.target.value })}
            />
          </div>
        </div>
        <div className="input-group" style={{ margin: 0 }}>
          <label>Descripción de la tarea</label>
          <textarea
            rows="2"
            placeholder="¿En qué trabajaste?"
            value={activity.report}
            onChange={(e) => updateActivity(index, { ...activity, report: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

function App() {
  const { instance, accounts } = useMsal() || { instance: null, accounts: [] }
  const isAuthenticated = useIsAuthenticated()

  const [weekDays] = useState(() => getWeekDays())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [activities, setActivities] = useState([{ issueKey: '', report: '', hours: '1' }])
  const [editableBody, setEditableBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('report')
  const [connectionStatus, setConnectionStatus] = useState('idle')
  const [totalDayHours, setTotalDayHours] = useState(0)

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('syncronic_config')
    return saved ? JSON.parse(saved) : { jiraEmail: '', jiraToken: '', emailRecipient: '', outlookClientId: '' }
  })

  // Nuevos estados para recordatorios
  const [reminderSettings, setReminderSettings] = useState(() => {
    const saved = localStorage.getItem('syncronic_reminders')
    return saved ? JSON.parse(saved) : { enabled: false, interval: 60, shiftEndTime: '17:00' }
  })

  const [jiraConnected, setJiraConnected] = useState(false)
  const [validatingJira, setValidatingJira] = useState(false)
  const [showJiraSuccess, setShowJiraSuccess] = useState(false)

  useEffect(() => {
    // Inicializar el cuerpo con el template base cuando cambia el día
    const baseBody = formatReportEmail(selectedDay, [])
    setEditableBody(baseBody)
    setActivities([{ issueKey: '', report: '', hours: '1' }])
    setTotalDayHours(0) // Resetear contador al cambiar de día
  }, [selectedDay])

  useEffect(() => {
    localStorage.setItem('syncronic_config', JSON.stringify(config))
  }, [config])

  useEffect(() => {
    localStorage.setItem('syncronic_reminders', JSON.stringify(reminderSettings))

    // Solicitar permiso si se activa la funcionalidad
    if (reminderSettings.enabled && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [reminderSettings])

  // Lógica de notificaciones en segundo plano
  useEffect(() => {
    if (!reminderSettings.enabled) return

    const checkInterval = setInterval(() => {
      const now = new Date()
      const [shiftH, shiftM] = reminderSettings.shiftEndTime.split(':').map(Number)

      // 1. Notificación de fin de jornada (10 min antes)
      const shiftEnd = new Date()
      shiftEnd.setHours(shiftH, shiftM, 0, 0)
      const tenMinsBefore = new Date(shiftEnd.getTime() - 10 * 60000)

      // Si estamos en el minuto exacto de los 10 min antes
      if (now.getHours() === tenMinsBefore.getHours() && now.getMinutes() === tenMinsBefore.getMinutes()) {
        if (Notification.permission === 'granted') {
          new Notification("¡Faltan 10 minutos!", {
            body: "Es hora de completar tu reporte y enviar el correo de fin de jornada.",
            icon: "/logo.png"
          })
        }
      }

      // 2. Notificación periódica (cada X minutos)
      // Usamos el residuo para saber si toca notificar (solo al inicio del minuto)
      const minutesPastMidnight = now.getHours() * 60 + now.getMinutes()
      if (minutesPastMidnight % reminderSettings.interval === 0 && now.getSeconds() < 1) {
        // Evitamos enviar si es muy cerca de la hora de salida (para no duplicar avisos)
        const diffToFinish = (shiftEnd.getTime() - now.getTime()) / 60000
        if (diffToFinish > 15 && Notification.permission === 'granted') {
          new Notification("Recordatorio Syncronic", {
            body: "¿Tienes actividades pendientes por imputar? Aprovecha ahora.",
            icon: "/logo.png"
          })
        }
      }
    }, 1000) // Revisar cada segundo para precisión, pero con filtros por minuto

    return () => clearInterval(checkInterval)
  }, [reminderSettings])

  const updateActivity = (index, newData) => {
    const nextArr = [...activities]
    nextArr[index] = newData
    setActivities(nextArr)
  }

  const removeActivity = (index) => {
    setActivities(activities.filter((_, i) => i !== index))
  }

  const handleConfigChange = (e) => {
    setConfig({ ...config, [e.target.name]: e.target.value })
    if (e.target.name === 'jiraEmail' || e.target.name === 'jiraToken') {
      setConnectionStatus('idle')
    }
  }

  const testConnection = async () => {
    if (!config.jiraEmail || !config.jiraToken) {
      alert("Configura tus credenciales de Jira primero.")
      return
    }
    setConnectionStatus('checking')
    try {
      await validateJiraConnection(config.jiraEmail, config.jiraToken)
      setConnectionStatus('success')
    } catch (error) {
      setConnectionStatus('error')
    }
  }

  const handleLogin = () => {
    if (!config.outlookClientId) {
      alert("Configura tu Client ID en el panel de configuración.")
      setActiveTab('config')
      return
    }
    instance.loginPopup(loginRequest).catch(console.error)
  }

  const handleJiraSync = async () => {
    const validActivities = activities.filter(a => a.issueKey && a.report)
    if (validActivities.length === 0) {
      alert("Completa al menos una actividad válida.")
      return
    }
    setLoading(true)
    try {
      for (const activity of validActivities) {
        const seconds = Math.round((parseFloat(activity.hours) || 1) * 3600)
        await logJiraWorklog(config.jiraEmail, config.jiraToken, activity.issueKey, activity.report, selectedDay, seconds)
      }

      // Obtener el fragmento de texto formateado
      const snippet = formatActivitySnippet(validActivities)

      // Insertar el fragmento en el editor de forma acumulativa (antes de los Saludos)
      setEditableBody(prev => {
        const parts = prev.split('Saludos,')
        if (parts.length > 1) {
          // Si hay una parte de introducción/actividades previas y una de salida
          const intro = parts[0].trim()
          const closing = 'Saludos,' + parts[1]
          return `${intro}\n${snippet}\n${closing}`
        }
        // Fallback por si el template se rompe
        return prev + '\n' + snippet
      })

      // Limpiar las tablas de actividad
      setActivities([{ issueKey: '', report: '', hours: '1' }])

      // Actualizar el contador de horas del día
      const addedHours = validActivities.reduce((sum, act) => sum + (parseFloat(act.hours) || 0), 0)
      setTotalDayHours(prev => prev + addedHours)

      alert("¡Éxito! Horas imputadas en Jira y añadidas al reporte.")
    } catch (error) {
      console.error(error)
      alert("Error al imputar horas en Jira. Revisa la consola.")
    } finally {
      setLoading(false)
    }
  }

  const handleSendEmail = async (method) => {
    // Enviar el contenido ACTUAL del editor (que es lo acumulado)
    if (!editableBody.includes('- [')) {
      alert("El reporte parece estar vacío. Imputa horas primero o escribe manualmente.")
      return
    }
    setLoading(true)
    try {
      const subject = `Reporte Diario - ${selectedDay.toLocaleDateString()}`
      if (method === 'outlook' && isAuthenticated) {
        const tokenResp = await instance.acquireTokenSilent({ ...loginRequest, account: accounts[0] })
        await sendOutlookEmail(tokenResp.accessToken, config.emailRecipient, subject, editableBody)
        alert("¡Éxito! Correo enviado vía Outlook.")
        // Limpiar el editor SOLO si el envío por Outlook fue exitoso
        const baseBody = formatReportEmail(selectedDay, [])
        setEditableBody(baseBody)
      } else {
        // Para mailto, COPIAMOS primero al portapapeles por seguridad
        try {
          await navigator.clipboard.writeText(editableBody)
          // No limpiamos el editor para evitar pérdida de datos si el mailto falla
          window.location.href = `mailto:${config.emailRecipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(editableBody)}`
          alert("Se ha copiado el reporte al portapapeles y se intentará abrir tu correo.")
        } catch (err) {
          console.error('Error al copiar:', err)
          window.location.href = `mailto:${config.emailRecipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(editableBody)}`
        }
      }
    } catch (error) {
      console.error(error)
      alert("Error al enviar el correo. Revisa la consola.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-layout">
      {/* HEADER */}
      <header className="top-header">
        <div className="latinia-logo" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingLeft: '1.5rem' }}>
          <img src="/logo.png" alt="Syncronic" style={{ height: '60px', width: 'auto', pointerEvents: 'none' }} />
        </div>
        <div style={{ flex: 1, paddingLeft: '1.5rem', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.5px', color: 'white', display: 'flex', alignItems: 'center' }}>
          Syncronic
        </div>
      </header>

      {/* SIDEBAR - Must be direct child of app-layout for grid to work */}
      <aside className="sidebar">
        <a href="#" className={`sidebar-item ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>
          <LayoutPanelLeft size={18} /> Panel global
        </a>
        <a href="#" className={`sidebar-item ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          <Settings size={18} /> Configuración
        </a>
        <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid var(--latinia-border)' }}>
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
              <div style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%' }}></div>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accounts?.[0]?.username}</span>
              <button onClick={() => instance.logoutPopup()} className="btn-icon" style={{ marginLeft: 'auto' }}><LogOut size={14} /></button>
            </div>
          ) : (
            <button className="btn btn-outline" style={{ width: '100%', fontSize: '0.75rem' }} onClick={handleLogin}>
              <LogIn size={14} /> CONECTAR OUTLOOK
            </button>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT - Must be direct child of app-layout for grid to work */}
      <main className="main-wrapper">
        <div className="breadcrumb-bar">
          <div className="breadcrumbs">
            <Home size={16} />
            <ChevronRight size={14} className="breadcrumb-separator" />
            <span>Syncronic</span>
            {activeTab === 'config' && (
              <>
                <ChevronRight size={14} className="breadcrumb-separator" />
                <span style={{ fontWeight: 600, color: 'var(--latinia-teal)' }}>Configuración</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={handleJiraSync} disabled={loading || connectionStatus !== 'success'}>
              <Send size={16} /> IMPUTAR HORAS
            </button>
          </div>
        </div>

        <div style={{ padding: '1.5rem', width: '100%', maxWidth: '1600px', margin: '0 auto' }}>
          {activeTab === 'report' ? (
            <div className="fade-in">
              <div className="card">
                <div className="status-grid">
                  <div style={{ background: 'white', padding: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {connectionStatus === 'success' ? <CircleCheck size={20} color="#10b981" /> : <CircleAlert size={20} color="#f59e0b" />}
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ESTADO JIRA:</div>
                        <div style={{ fontSize: '0.85rem', color: connectionStatus === 'success' ? '#10b981' : '#f59e0b', fontWeight: 600 }}>{connectionStatus === 'success' ? 'CONECTADO' : 'PENDIENTE'}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ background: 'white', padding: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {isAuthenticated ? <CircleCheck size={20} color="#10b981" /> : <CircleAlert size={20} color="#f59e0b" />}
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ESTADO OUTLOOK:</div>
                        <div style={{ fontSize: '0.85rem', color: isAuthenticated ? '#10b981' : '#f59e0b', fontWeight: 600 }}>{isAuthenticated ? 'CONECTADO' : 'PENDIENTE'}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ background: 'white', padding: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Calendar size={20} color="var(--text-secondary)" />
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>FECHA REPORTE:</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{selectedDay.toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ background: 'white', padding: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Clock size={20} color="var(--latinia-teal)" />
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>HORAS IMPUTADAS:</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--latinia-teal)', fontWeight: 700 }}>{totalDayHours} h</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>SELECCIONAR DÍA:</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {weekDays.map((day, idx) => (
                    <button key={idx} className={`day-btn ${day.toDateString() === selectedDay.toDateString() ? 'active' : ''}`} onClick={() => setSelectedDay(day)} style={{ minWidth: '80px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{day.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase()}</span>
                      <span style={{ fontSize: '1rem', fontWeight: 700 }}>{day.getDate()}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="dashboard-grid">
                <div>
                  {activities.map((a, i) => <ActivityRow key={i} index={i} activity={a} updateActivity={updateActivity} removeActivity={removeActivity} config={config} />)}
                  <button className="btn btn-outline" onClick={() => setActivities([...activities, { issueKey: '', report: '', hours: '1' }])} style={{ width: '100%', borderStyle: 'dashed' }}>
                    <Plus size={18} /> AÑADIR OTRA ACTIVIDAD
                  </button>
                </div>
                <div className="card">
                  <div className="card-header"><span style={{ fontSize: '0.8rem', fontWeight: 700 }}>EDITOR DE REPORTE</span></div>
                  <div className="card-body" style={{ padding: '1rem' }}>
                    <textarea style={{ height: '350px', fontSize: '0.85rem', fontFamily: 'monospace' }} value={editableBody} onChange={e => setEditableBody(e.target.value)} />
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-outline" style={{ flex: 1 }} onClick={async () => {
                        await navigator.clipboard.writeText(editableBody)
                        alert("Reporte copiado al portapapeles")
                      }}>
                        <Clipboard size={16} /> COPIAR
                      </button>
                      <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => handleSendEmail('mailto')}><Mail size={16} /> MAILTO</button>
                      <button className="btn btn-primary" style={{ flex: 1.5 }} onClick={() => handleSendEmail('outlook')} disabled={!isAuthenticated}><Send size={16} /> ENVIAR OUTLOOK</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card fade-in">
              <div className="card-header"><div className="card-title"><Settings size={18} /> CONFIGURACIÓN</div></div>
              <div className="card-body">
                <div className="config-grid">
                  <div className="config-section" style={{ padding: '1rem', border: '1px solid var(--latinia-border)', borderRadius: '4px' }}>
                    <h5 style={{ color: 'var(--latinia-teal)', marginBottom: '1rem' }}>JIRA CLOUD</h5>
                    <div className="input-group">
                      <label>Email</label>
                      <input type="text" name="jiraEmail" value={config.jiraEmail} onChange={handleConfigChange} />
                    </div>
                    <div className="input-group">
                      <label>Token</label>
                      <input type="password" name="jiraToken" value={config.jiraToken} onChange={handleConfigChange} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <button className="btn btn-outline" onClick={testConnection} disabled={connectionStatus === 'checking'}>
                        {connectionStatus === 'checking' ? <Loader2 size={16} className="spin" /> : 'VALIDAR'}
                      </button>
                      {connectionStatus === 'success' && (
                        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                          <CircleCheck size={16} /> Conexión exitosa
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="config-section" style={{ padding: '1rem', border: '1px solid var(--latinia-border)', borderRadius: '4px' }}>
                    <h5 style={{ color: 'var(--latinia-teal)', marginBottom: '1rem' }}>OUTLOOK</h5>
                    <div className="input-group">
                      <label>Azure Client ID</label>
                      <input type="text" name="outlookClientId" value={config.outlookClientId} onChange={handleConfigChange} />
                    </div>
                    <div className="input-group">
                      <label>Destinatario</label>
                      <input type="text" name="emailRecipient" value={config.emailRecipient} onChange={handleConfigChange} />
                    </div>
                  </div>
                </div>
              </div>

              {/* RECORDATORIOS */}
              <div className="card fade-in">
                <div className="card-header">
                  <div className="card-title">
                    <Bell size={20} color="var(--latinia-teal)" />
                    RECORDATORIOS Y NOTIFICACIONES
                  </div>
                </div>
                <div className="card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <label className="switch" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={reminderSettings.enabled}
                        onChange={(e) => setReminderSettings({ ...reminderSettings, enabled: e.target.checked })}
                      />
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Activar recordatorios automáticos</span>
                    </label>
                  </div>

                  <div className="config-grid">
                    <div className="input-group">
                      <label>Frecuencia (minutos)</label>
                      <input
                        type="number"
                        min="5"
                        value={reminderSettings.interval}
                        onChange={(e) => setReminderSettings({ ...reminderSettings, interval: parseInt(e.target.value) || 5 })}
                        disabled={!reminderSettings.enabled}
                      />
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Cada cuánto tiempo recibirás un aviso para imputar horas.
                      </p>
                    </div>

                    <div className="input-group">
                      <label>Hora de salida (Jornada)</label>
                      <input
                        type="time"
                        value={reminderSettings.shiftEndTime}
                        onChange={(e) => setReminderSettings({ ...reminderSettings, shiftEndTime: e.target.value })}
                        disabled={!reminderSettings.enabled}
                        style={{ padding: '0.5rem' }}
                      />
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Te avisaremos 10 min antes de esta hora para el reporte final.
                      </p>
                    </div>
                  </div>

                  {reminderSettings.enabled && Notification.permission === 'denied' && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#FEF9E7', border: '1px solid #F7DC6F', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CircleAlert size={16} color="#B7950B" />
                      <span style={{ fontSize: '0.8rem', color: '#7D6608' }}>
                        Las notificaciones están bloqueadas en tu navegador. Por favor, actívalas para recibir alertas.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .btn-icon { background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
      `}</style>
    </div>
  )
}

export default App
