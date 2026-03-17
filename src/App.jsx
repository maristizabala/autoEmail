import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  CircleCheck, Mail, Clipboard, Terminal, Search, Loader2, Plus, Trash2,
  CircleX, Clock, CircleAlert, LogIn, LogOut, Home, User, Briefcase, Bell,
  LayoutPanelLeft, ChevronRight, EllipsisVertical, Calendar, Send, Settings, History, Edit3, Check, Save, X
} from 'lucide-react'

const JIRA_API_URL = '/jira-api';
const TEMPO_API_URL = '/tempo-api';
import {
  validateJiraConnection,
  logJiraWorklog,
  getWeekDays,
  formatReportEmail,
  formatActivitySnippet,
  fetchJiraWorklogs,
  fetchDetailedWorklogs,
  updateJiraWorklog,
  deleteJiraWorklog,
  searchJiraIssues,
  formatDateLocal,
  getTempoHeaders
} from './services/reportService';

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

function HistoryEntry({ worklog, onUpdate, onDelete, config }) {
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editValues, setEditValues] = useState({
    comment: worklog.comment,
    hours: worklog.timeSpentSeconds / 3600
  })
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      const seconds = Math.round(parseFloat(editValues.hours) * 3600)
      await onUpdate(worklog.issueKey, worklog.id, editValues.comment, seconds)
      setIsEditing(false)
    } catch (e) {
      alert("Error al actualizar")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      await onDelete(worklog.issueKey, worklog.id)
      setShowDeleteConfirm(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card fade-in" style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem' }}>
      {isEditing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 80px auto', gap: '1rem', alignItems: 'end' }}>
          <div className="input-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.7rem' }}>{worklog.issueKey} - Descripción</label>
            <textarea
              rows="2"
              className="edit-description-input"
              value={editValues.comment}
              onChange={(e) => setEditValues({ ...editValues, comment: e.target.value })}
              style={{ minWidth: '0', width: '100%' }}
            />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.7rem' }}>Horas</label>
            <input
              type="number"
              step="0.5"
              className="edit-hours-input"
              value={editValues.hours}
              onChange={(e) => setEditValues({ ...editValues, hours: e.target.value })}
              style={{ minWidth: '0', width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', paddingBottom: '2px', minWidth: '80px', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleSave} 
              disabled={loading} 
              title="Guardar"
              style={{ width: '38px', height: '38px', padding: 0, minWidth: '38px' }}
            >
              {loading ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
            </button>
            <button 
              className="btn btn-outline" 
              onClick={() => setIsEditing(false)} 
              disabled={loading} 
              title="Cancelar"
              style={{ width: '38px', height: '38px', padding: 0, minWidth: '38px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : showDeleteConfirm ? (
        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FDF2F2', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid #FDE2E2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#C81E1E', fontSize: '0.85rem', fontWeight: 600 }}>
            <Trash2 size={18} />
            <span>¿Confirmas que deseas eliminar este registro?</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleDelete}
              disabled={loading}
              style={{ background: '#C81E1E', fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
            >
              ELIMINAR
            </button>
            <button 
              className="btn btn-outline" 
              onClick={() => setShowDeleteConfirm(false)}
              disabled={loading}
              style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
            >
              CANCELAR
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'var(--latinia-bg)', padding: '0.4rem 0.6rem', borderRadius: '4px', minWidth: '85px', textAlign: 'center' }}>
            <span style={{ fontWeight: 700, color: 'var(--latinia-teal)', fontSize: '0.85rem' }}>{worklog.issueKey}</span>
          </div>
          <div style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            {worklog.comment}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              <Clock size={14} /> {worklog.timeSpentSeconds / 3600}h
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="btn-icon" 
                onClick={() => setIsEditing(true)} 
                style={{ color: 'var(--latinia-teal)' }} 
                title="Editar"
              >
                <Edit3 size={16} />
              </button>
              <button 
                className="btn-icon" 
                onClick={() => setShowDeleteConfirm(true)} 
                style={{ 
                  color: '#E74C3C', 
                  width: '32px', 
                  height: '32px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'background 0.2s'
                }} 
                title="Eliminar"
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {

  const [weekDays] = useState(() => getWeekDays())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [activities, setActivities] = useState([{ issueKey: '', report: '', hours: '1' }])
  const [editableBody, setEditableBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('report')
  const [jiraConnection, setJiraConnection] = useState('idle')
  const [tempoConnection, setTempoConnection] = useState('idle')
  const [totalDayHours, setTotalDayHours] = useState(0)

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('syncronic_config')
    const baseConfig = { jiraEmail: '', jiraToken: '', tempoToken: '' }
    return saved ? { ...baseConfig, ...JSON.parse(saved) } : baseConfig
  })

  // Estado para el historial de la semana
  const [weeklyHistory, setWeeklyHistory] = useState({})
  const [fetchingHistory, setFetchingHistory] = useState(false)

  // Nuevos estados para recordatorios
  const [reminderSettings, setReminderSettings] = useState(() => {
    const saved = localStorage.getItem('syncronic_reminders')
    return saved ? JSON.parse(saved) : { enabled: false, interval: 60, shiftEndTime: '17:00' }
  })

  const [jiraConnected, setJiraConnected] = useState(false)
  const [validatingJira, setValidatingJira] = useState(false)
  const [showJiraSuccess, setShowJiraSuccess] = useState(false)

  useEffect(() => {
    // Intentar cargar borrador guardado para este día
    const dateStr = formatDateLocal(selectedDay)
    const savedDraft = localStorage.getItem(`syncronic_draft_${dateStr}`)
    
    if (savedDraft) {
      try {
        const { body, activities: savedActivities } = JSON.parse(savedDraft)
        setEditableBody(body)
        setActivities(savedActivities)
      } catch (e) {
        console.error("Error al cargar el borrador guardado:", e)
      }
    } else {
      // Si no hay borrador, inicializar con el template base
      const baseBody = formatReportEmail(selectedDay, [])
      setEditableBody(baseBody)
      setActivities([{ issueKey: '', report: '', hours: '1' }])
    }

    // Cargar horas automáticamente desde Jira si tenemos conexión
    const loadHoursFromJira = async () => {
      if (config.jiraEmail && config.jiraToken && jiraConnection === 'success') {
        try {
          const { totalHours } = await fetchJiraWorklogs(config.jiraEmail, config.jiraToken, selectedDay)
          setTotalDayHours(totalHours)
        } catch (error) {
          console.error("No se pudieron cargar las horas de Jira:", error)
        }
      } else {
        setTotalDayHours(0)
      }
    }
    loadHoursFromJira()
  }, [selectedDay]) // Solo cuando cambia el día seleccionado

  // Efecto separado para guardar borradores en tiempo real
  useEffect(() => {
    const dateStr = formatDateLocal(selectedDay)
    const draft = {
      body: editableBody,
      activities: activities
    }
    // Solo guardar si hay algo relevante para evitar llenar el storage con vacíos
    if (editableBody || (activities.length > 0 && activities[0].issueKey)) {
      localStorage.setItem(`syncronic_draft_${dateStr}`, JSON.stringify(draft))
    }
  }, [editableBody, activities, selectedDay])

  // Auto-validación al iniciar la aplicación
  useEffect(() => {
    if (config.jiraEmail && config.jiraToken) {
      testConnection()
    }
  }, [])

  // Cargar historial semanal cuando cambia la pestaña
  useEffect(() => {
    if (activeTab === 'history' && jiraConnection === 'success') {
      loadWeeklyHistory()
    }
  }, [activeTab, jiraConnection])

  const loadWeeklyHistory = async () => {
    setFetchingHistory(true)
    const history = {}
    try {
      for (const day of weekDays) {
        const dateStr = formatDateLocal(day)
        const worklogs = await fetchDetailedWorklogs(config.jiraEmail, config.jiraToken, day)
        history[dateStr] = worklogs
      }
      setWeeklyHistory(history)
    } catch (error) {
      console.error("Error cargando historial semanal:", error)
    } finally {
      setFetchingHistory(false)
    }
  }

  useEffect(() => {
    localStorage.setItem('syncronic_config', JSON.stringify(config))
  }, [config])

  useEffect(() => {
    localStorage.setItem('syncronic_reminders', JSON.stringify(reminderSettings))
  }, [reminderSettings])

  const handleToggleReminders = (enabled) => {
    if (enabled && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    setReminderSettings({ ...reminderSettings, enabled })
  }

  // Lógica de notificaciones en segundo plano
  useEffect(() => {
    if (!reminderSettings.enabled) return

    const checkInterval = setInterval(() => {
      const now = new Date()
      const [shiftH, shiftM] = reminderSettings.shiftEndTime.split(':').map(Number)
      const shiftEnd = new Date()
      shiftEnd.setHours(shiftH, shiftM, 0, 0)

      // 1. Notificación de fin de jornada (10 min antes)
      const tenMinsBefore = new Date(shiftEnd.getTime() - 10 * 60000)

      // Log de depuración cada segundo para asegurar que el sistema está vivo
      if (now.getSeconds() === 0) {
        console.log(`[Syncronic] Verificando: ${now.toLocaleTimeString()} | Fin: ${reminderSettings.shiftEndTime} | Intervalo: ${reminderSettings.interval}m | Horas: ${totalDayHours}h`)
      }

      // 1. Notificación de fin de jornada (10 min antes)
      if (now.getHours() === tenMinsBefore.getHours() && 
          now.getMinutes() === tenMinsBefore.getMinutes() && 
          now.getSeconds() < 1) {
        if (Notification.permission === 'granted') {
          console.log("Trigger: Notificación de 10 min antes.")
          new Notification("¡Faltan 10 minutos!", {
            body: "Es hora de completar tu reporte y enviar el correo de fin de jornada.",
            icon: "/logo.png"
          })
        } else {
          console.warn("Permiso de notificación no otorgado para aviso de 10 min.")
        }
      }

      // 2. Notificación periódica (cada X minutos)
      const minutesPastMidnight = now.getHours() * 60 + now.getMinutes()
      if (minutesPastMidnight % reminderSettings.interval === 0 && now.getSeconds() < 1) {
        const diffToFinish = (shiftEnd.getTime() - now.getTime()) / 60000
        
        // Verificación de condiciones para el trigger periódico
        if (diffToFinish <= 15) {
          console.log(`[Syncronic] Trigger periódico omitido: Muy cerca del fin de jornada (${Math.round(diffToFinish)} min restantes).`)
        } else if (totalDayHours >= 8) {
          console.log(`[Syncronic] Trigger periódico omitido: Ya tienes ${totalDayHours}h imputadas.`)
        } else {
          if (Notification.permission === 'granted') {
            console.log("Trigger: Notificación periódica.")
            new Notification("Recordatorio Syncronic", {
              body: "¿Tienes actividades pendientes por imputar? Aprovecha ahora.",
              icon: "/logo.png"
            })
          } else {
            console.warn("Permiso de notificación no otorgado para aviso periódico.")
          }
        }
      }
    }, 1000)

    return () => clearInterval(checkInterval)
  }, [reminderSettings, totalDayHours])

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
      setJiraConnection('idle')
    } else if (e.target.name === 'tempoToken') {
      setTempoConnection('idle')
    }
  }

  const testConnection = async () => {
    if (!config.jiraEmail || !config.jiraToken) {
      alert("Configura tus credenciales de Jira primero.")
      return
    }
    
    // 1. Validar Jira
    setJiraConnection('checking')
    try {
      const myself = await validateJiraConnection(config.jiraEmail, config.jiraToken)
      setJiraConnection('success')
      const accountId = myself.accountId
      
      // 2. Validar Tempo solo si Jira fue exitoso y hay un token
      if (config.tempoToken) {
        setTempoConnection('checking')
        try {
          // Usamos el accountId obtenido de Jira para validar Tempo adecuadamente
          await axios.get(`${TEMPO_API_URL}/4/worklogs/user/${accountId}?limit=1`, { 
            headers: getTempoHeaders(config.tempoToken) 
          });
          setTempoConnection('success')
        } catch (e) {
          console.error("Tempo Validation Error:", e.response?.data || e.message);
          setTempoConnection('error')
        }
      }
    } catch (error) {
      setJiraConnection('error')
    }
  }

  const handleJiraSync = async () => {
    const validActivities = activities.filter(a => a.issueKey && a.report)
    if (validActivities.length === 0) {
      alert("Completa al menos una actividad válida.")
      return
    }
    setLoading(true)
    try {
      if (jiraConnection === 'success') {
        for (const activity of validActivities) {
          const seconds = Math.round((parseFloat(activity.hours) || 1) * 3600)
          await logJiraWorklog(config.jiraEmail, config.jiraToken, activity.issueKey, activity.report, selectedDay, seconds)
        }
      } else {
        console.warn("Jira no está conectado. Solo se actualizará el reporte local.")
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

      // Actualizar el contador de horas del día llamando a Jira de nuevo para asegurar precisión
      const { totalHours } = await fetchJiraWorklogs(config.jiraEmail, config.jiraToken, selectedDay)
      setTotalDayHours(totalHours)

      alert("¡Éxito! Horas imputadas en Jira y añadidas al reporte.")
    } catch (error) {
      console.error(error)
      alert("Error al imputar horas en Jira. Revisa la consola.")
    } finally {
      setLoading(false)
    }
  }

  const handleSendEmail = async () => {
    // Enviar el contenido ACTUAL del editor (que es lo acumulado)
    const baseEmpty = formatReportEmail(selectedDay, [])
    if (editableBody.trim() === baseEmpty.trim() || editableBody.length < 30) {
      alert("El reporte parece estar vacío. Imputa horas primero o escribe manualmente.")
      return
    }
    setLoading(true)
    try {
      // Calcular fecha de hoy para el reporte
      const todayStr = selectedDay.toLocaleDateString()
      
      // Calcular fecha del "Plan" (Mañana, o Lunes si es viernes/fin de semana)
      const planDay = new Date(selectedDay)
      const dayOfWeek = planDay.getDay() 
      
      if (dayOfWeek === 5) { planDay.setDate(planDay.getDate() + 3) }
      else if (dayOfWeek === 6) { planDay.setDate(planDay.getDate() + 2) }
      else { planDay.setDate(planDay.getDate() + 1) }
      
      const planStr = planDay.toLocaleDateString()
      const subject = `Reporte ${todayStr} - Plan ${planStr}`
      
      const subjectEnc = encodeURIComponent(subject)
      const bodyEnc = encodeURIComponent(editableBody)
      
      // Usar destinatario fijo ya que se eliminó de la config
      const mailtoUrl = `mailto:qa_global@latinia.com?subject=${subjectEnc}&body=${bodyEnc}`
      
      window.location.href = mailtoUrl
      navigator.clipboard.writeText(editableBody)
      alert("Se ha copiado el reporte al portapapeles y se ha solicitado abrir tu correo.")
    } catch (e) {
      console.error(e)
      alert("Error al preparar correo")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-layout">
      {/* HEADER */}
      <header className="top-header">
        <div className="latinia-logo" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingLeft: '1.5rem' }}>
          <img src="/logo.png" alt="Latinia" style={{ height: '60px', width: 'auto', pointerEvents: 'none' }} />
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
        <a href="#" className={`sidebar-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          <History size={18} /> Historial Semanal
        </a>
        <a href="#" className={`sidebar-item ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          <Settings size={18} /> Configuración
        </a>
        <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid var(--latinia-border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Syncronic v1.0
          </div>
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
            <button className="btn btn-primary" onClick={handleJiraSync} disabled={loading}>
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
                      {jiraConnection === 'success' ? <CircleCheck size={20} color="#10b981" /> : <CircleAlert size={20} color="#f59e0b" />}
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ESTADO JIRA:</div>
                        <div style={{ fontSize: '0.85rem', color: jiraConnection === 'success' ? '#10b981' : '#f59e0b', fontWeight: 600 }}>{jiraConnection === 'success' ? 'CONECTADO' : 'PENDIENTE'}</div>
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
                      <button className="btn btn-primary" style={{ flex: 1.5 }} onClick={handleSendEmail}><Mail size={16} /> ENVIAR REPORTE (MAILTO)</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'history' ? (
            <div className="fade-in">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1.5rem' }}>
                <div className="card-title"><History size={20} color="var(--latinia-teal)" /> HISTORIAL DE LA SEMANA</div>
                {fetchingHistory && <Loader2 size={20} className="spin" color="var(--latinia-teal)" />}
              </div>
              
              <div style={{ display: 'grid', gap: '2rem' }}>
                {weekDays.map(day => {
                  const dateStr = day.toISOString().split('T')[0]
                  const logs = weeklyHistory[dateStr] || []
                  const dayTotal = logs.reduce((sum, l) => sum + (l.timeSpentSeconds / 3600), 0)
                  
                  return (
                    <div key={dateStr} className="config-section" style={{ border: 'none', background: '#f8fafc', padding: '1.5rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ background: 'var(--latinia-teal)', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 800 }}>
                            {day.toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase()} {day.getDate()}
                          </div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {day.toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ color: 'var(--latinia-teal)', fontWeight: 800, fontSize: '1rem' }}>
                          {dayTotal}h imputadas
                        </div>
                      </div>
                      
                      {logs.length > 0 ? (
                        <div>
                          {logs.map(log => (
                            <HistoryEntry 
                              key={log.id} 
                              worklog={log} 
                              config={config}
                              onUpdate={async (key, id, comment, sec) => {
                                await updateJiraWorklog(config.jiraEmail, config.jiraToken, key, id, comment, sec, log.started, log.authorAccountId)
                                loadWeeklyHistory()
                                // Si editamos el día seleccionado hoy, actualizar el contador global
                                if (day.toDateString() === selectedDay.toDateString()) {
                                  const { totalHours } = await fetchJiraWorklogs(config.jiraEmail, config.jiraToken, selectedDay)
                                  setTotalDayHours(totalHours)
                                }
                              }}
                              onDelete={async (key, id) => {
                                try {
                                  setFetchingHistory(true)
                                  await deleteJiraWorklog(config.jiraEmail, config.jiraToken, key, id)
                                  await loadWeeklyHistory()
                                  if (day.toDateString() === selectedDay.toDateString()) {
                                    const { totalHours } = await fetchJiraWorklogs(config.jiraEmail, config.jiraToken, selectedDay)
                                    setTotalDayHours(totalHours)
                                  }
                                } catch (e) {
                                  console.error(e)
                                  alert("Error al eliminar el registro. Revisa la consola.")
                                } finally {
                                  setFetchingHistory(false)
                                }
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem', background: 'white', borderRadius: '4px', border: '1px dashed var(--latinia-border)' }}>
                          No hay horas registradas para este día.
                        </div>
                      )}
                    </div>
                  )
                })}
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
                      <button className="btn btn-outline" onClick={testConnection} disabled={jiraConnection === 'checking' || tempoConnection === 'checking'}>
                        {jiraConnection === 'checking' || tempoConnection === 'checking' ? <Loader2 size={16} className="spin" /> : 'VALIDAR'}
                      </button>
                      {jiraConnection === 'success' && (
                        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                          <CircleCheck size={16} /> Jira conectado
                        </div>
                      )}
                      {jiraConnection === 'error' && (
                        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>
                          <CircleAlert size={16} /> Error en Jira
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="config-section" style={{ 
                    padding: '1rem', 
                    border: '1px solid var(--latinia-border)', 
                    borderRadius: '4px',
                    opacity: jiraConnection === 'success' ? 1 : 0.6,
                    background: jiraConnection === 'success' ? 'transparent' : '#f9fafb'
                  }}>
                    <h5 style={{ color: 'var(--latinia-teal)', marginBottom: '1rem' }}>TEMPO CLOUD (RECOMENDADO)</h5>
                    {!config.tempoToken && jiraConnection !== 'success' && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                        * Valida primero la conexión a Jira para habilitar Tempo.
                      </p>
                    )}
                    <div className="input-group">
                      <label>Tempo API Token</label>
                      <input 
                        type="password" 
                        name="tempoToken" 
                        placeholder="Bearer token de Tempo"
                        value={config.tempoToken || ''} 
                        onChange={handleConfigChange} 
                        disabled={jiraConnection !== 'success'}
                      />
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          Recomendado para una sincronización perfecta de horas.
                        </p>
                        {tempoConnection === 'success' && (
                          <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                            <CircleCheck size={16} /> Tempo activo
                          </div>
                        )}
                        {tempoConnection === 'error' && (
                          <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>
                            <CircleAlert size={16} /> Token inválido
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="config-section" style={{ padding: '1rem', border: '1px solid var(--latinia-border)', borderRadius: '4px' }}>
                    <h5 style={{ color: 'var(--latinia-teal)', marginBottom: '1rem' }}>SISTEMA</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                        <CircleCheck size={16} /> Persistencia de borradores activa
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Tus cambios se guardan automáticamente por día en el navegador. La conexión se restaura al iniciar.
                      </p>
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
                        onChange={(e) => handleToggleReminders(e.target.checked)}
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
