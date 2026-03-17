import axios from 'axios';

// Usamos un proxy de Vite para evitar problemas de CORS en desarrollo local
const JIRA_API_URL = '/jira-api';
// Proxy de Vite para la API de Tempo
const TEMPO_API_URL = '/tempo-api';

/**
 * Función auxiliar para obtener las cabeceras comunes
 */
const getJiraHeaders = (email, apiToken) => {
  const auth = btoa(`${email}:${apiToken}`);
  return {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Atlassian-Token': 'no-check',
    'X-Requested-With': 'XMLHttpRequest'
  };
};

/**
 * Función auxiliar para obtener las cabeceras de Tempo (Bearer Auth)
 */
export const getTempoHeaders = (token) => {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
};

/**
 * Caché en memoria para IDs de Jira Issues -> Keys
 */
const issueKeyCache = {};

/**
 * Resuelve un ID de Issue a su Key (ej: 12345 -> LAT-10) usando la API de Jira
 */
const resolveIssueKey = async (email, apiToken, issueId) => {
  if (issueKeyCache[issueId]) return issueKeyCache[issueId];
  
  try {
    const response = await axios.get(
      `${JIRA_API_URL}/rest/api/3/issue/${issueId}?fields=key`,
      { headers: getJiraHeaders(email, apiToken) }
    );
    const key = response.data.key;
    issueKeyCache[issueId] = key;
    return key;
  } catch (error) {
    console.error(`Error resolviendo Key para issue ${issueId}:`, error.message);
    return `ID-${issueId}`;
  }
};

/**
 * Helper para formatear fechas a YYYY-MM-DD usando la zona horaria local
 * Esto evita desfases horarios donde el UTC "11 PM de ayer" sea considerado un día diferente.
 */
export const formatDateLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Helper para procesar arrays en lotes (chunks) y no saturar el servidor/proxy proxy
 */
const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

/**
 * Valida las credenciales del usuario en Jira
 */
export const validateJiraConnection = async (email, apiToken) => {
  try {
    const response = await axios.get(
      `${JIRA_API_URL}/rest/api/3/myself`,
      {
        headers: getJiraHeaders(email, apiToken)
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error validating Jira connection:", error);
    throw error;
  }
};

/**
 * Registra un worklog en Jira (Tempo)
 * @param {Date} date - La fecha en la que se realizó el trabajo
 */
export const logJiraWorklog = async (email, apiToken, issueKey, comment, date, timeSpentSeconds = 3600) => {
  try {
    // Formatear la fecha para Jira: YYYY-MM-DDThh:mm:ss.sssZ
    // Usamos las 09:00 AM del día seleccionado como hora de inicio por defecto
    const startedDate = new Date(date);
    startedDate.setHours(9, 0, 0, 0);
    const started = startedDate.toISOString().replace('Z', '+0000');

    const response = await axios.post(
      `${JIRA_API_URL}/rest/api/3/issue/${issueKey}/worklog`,
      {
        comment: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: comment
                }
              ]
            }
          ]
        },
        timeSpentSeconds: timeSpentSeconds,
        started: started
      },
      {
        headers: getJiraHeaders(email, apiToken)
      }
    );

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      console.error("Jira API Error Details:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

/**
 * Obtiene las horas totales imputadas por el usuario en una fecha específica
 */
export const fetchJiraWorklogs = async (email, apiToken, date) => {
  try {
    const myself = await validateJiraConnection(email, apiToken);
    const accountId = myself.accountId;

    // Si tenemos Token de Tempo, usar la API oficial de Tempo directamente
    const savedConfig = localStorage.getItem('syncronic_config');
    const tempoToken = savedConfig ? JSON.parse(savedConfig).tempoToken : null;

    if (tempoToken) {
      console.log(`[TempoSync] Usando API oficial de Tempo para el total de horas...`);
      const dateStr = formatDateLocal(date);
      try {
        const response = await axios.get(
          `${TEMPO_API_URL}/4/worklogs/user/${accountId}?from=${dateStr}&to=${dateStr}`,
          { headers: getTempoHeaders(tempoToken) }
        );
        const tempoResults = response.data.results || [];
        const totalSec = tempoResults.reduce((acc, wl) => acc + wl.timeSpentSeconds, 0);
        return { totalHours: totalSec / 3600, debugLogs: [] };
      } catch (e) {
        console.error(`[TempoSync] Error en API de Tempo, reintentando con Jira API:`, e.message);
      }
    }

    const dateStr = formatDateLocal(date);
    console.log(`[JiraSync] Buscando horas para la fecha: ${dateStr} (Local)`);

    // JQL ultra-específico: Solo issues que TIENEN worklogs en esta fecha
    const jql = `worklogDate = "${dateStr}"`;
    console.log(`[JiraSync] JQL Optimizado: ${jql}`);

    const searchResponse = await axios.post(
      `${JIRA_API_URL}/rest/api/3/search/jql`,
      {
        jql: jql,
        fields: ["key", "summary"],
        maxResults: 100 // Ya no necesitamos 200, será una lista corta
      },
      { headers: getJiraHeaders(email, apiToken) }
    );

    const issues = searchResponse.data.issues || [];
    console.log(`[JiraSync] Issues encontrados (${issues.length}):`, issues.map(i => `${i.key}: ${i.fields.summary}`));

    // Fetch worklogs with properties in batches to prevent 500 errors from Vite Proxy/Jira API
    const results = [];
    const issueChunks = chunkArray(issues, 3); // Lotes más pequeños (3) para mayor estabilidad
    
    for (const chunk of issueChunks) {
      if (results.length > 0) {
        await new Promise(r => setTimeout(r, 200)); // Pequeña pausa entre lotes
      }
      const chunkPromises = chunk.map(async (issue) => {
        try {
          const response = await axios.get(
            `${JIRA_API_URL}/rest/api/3/issue/${issue.key}/worklog?expand=properties`,
            { headers: getJiraHeaders(email, apiToken) }
          );
          return { key: issue.key, worklogs: response.data.worklogs || [] };
        } catch (err) {
          console.error(`Error fetching worklogs for ${issue.key}:`, err.message);
          return { key: issue.key, worklogs: [] };
        }
      });
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }
    
    // FASE DE DESCUBRIMIENTO: Encontrar el tempo_id y persistirlo
    let userTempoId = localStorage.getItem('syncronic_tempo_id');
    
    // Buscar en los resultados actuales si hay un tempo_id
    results.forEach(({ worklogs }) => {
      worklogs.forEach(wl => {
        if (wl.author?.accountId === accountId) {
          const tempoProp = wl.properties?.find(p => p.key === 'tempo');
          if (tempoProp?.value?.tempo_id) {
            userTempoId = tempoProp.value.tempo_id;
            localStorage.setItem('syncronic_tempo_id', userTempoId);
          }
        }
      });
    });

    // FASE DE DEEP DISCOVERY: Si aún no hay tempo_id, buscar en el historial reciente
    if (!userTempoId) {
      console.log(`[JiraSync] Tempo ID no encontrado en caché ni resultados actuales. Iniciando Deep Discovery (30d)...`);
      try {
        const deepJql = `worklogAuthor = "${accountId}" AND updated >= "-30d" ORDER BY updated DESC`;
        const deepRes = await axios.post(
          `${JIRA_API_URL}/rest/api/3/search/jql`,
          { jql: deepJql, fields: ["key"], maxResults: 10 }, // 10 issues for better reach
          { headers: getJiraHeaders(email, apiToken) }
        );
        const deepIssues = deepRes.data.issues || [];
        // Deep discovery también en lotes para evitar 500s
        const issueChunks = chunkArray(deepIssues, 3);
        for (const chunk of issueChunks) {
          if (userTempoId) break;
          const chunkPromises = chunk.map(async (dIssue) => {
            try {
              const wlRes = await axios.get(
                `${JIRA_API_URL}/rest/api/3/issue/${dIssue.key}/worklog?expand=properties`,
                { headers: getJiraHeaders(email, apiToken) }
              );
              const wls = wlRes.data.worklogs || [];
              for (const wl of wls) {
                if (wl.author?.accountId === accountId) {
                  const tempoProp = wl.properties?.find(p => p.key === 'tempo');
                  if (tempoProp?.value?.tempo_id) {
                    return tempoProp.value.tempo_id;
                  }
                }
              }
            } catch (e) {
              console.error(`Deep fetch falló para ${dIssue.key}:`, e.message);
            }
            return null;
          });
          
          const chunkIds = await Promise.all(chunkPromises);
          userTempoId = chunkIds.find(id => id !== null);
          if (userTempoId) {
            localStorage.setItem('syncronic_tempo_id', userTempoId);
            console.log(`[JiraSync] Deep Discovery Exitoso!`);
          } else {
            await new Promise(r => setTimeout(r, 200));
          }
        }
      } catch (e) {
        console.error(`[JiraSync] Deep Discovery falló:`, e.message);
      }
    }

    if (userTempoId) {
      console.log(`[JiraSync] Huella digital lista! Miguel's Tempo ID: ${userTempoId}`);
    } else {
      console.log(`[JiraSync] No se encontró Tempo ID. Se usará coincidencia estricta.`);
    }

    const debugLogs = [];
    let totalSeconds = 0;

    for (const { key: issueKey, worklogs } of results) {
      worklogs.forEach(wl => {
        const wlDate = formatDateLocal(new Date(wl.started));
        if (wlDate !== dateStr) return;

        const isTempoApp = wl.author.accountType === 'app' && 
                          (wl.author.displayName?.toLowerCase().includes('tempo') || 
                           wl.author.displayName?.toLowerCase().includes('timesheets') ||
                           wl.author.displayName?.toLowerCase().includes('global'));
        
        // Atribución Robusta (Fingerprint Identity)
        const isDirectMatch = wl.author.accountId === accountId;
        const tempoProp = wl.properties?.find(p => p.key === 'tempo');
        const wlTempoId = tempoProp?.value?.tempo_id;
        const isTempoMatch = userTempoId && wlTempoId === userTempoId;
        const isUpdateMatch = wl.updateAuthor?.accountId === accountId;

        const isAuthor = isDirectMatch || isTempoMatch || isUpdateMatch ||
                         (isTempoApp && wl.properties?.some(p => JSON.stringify(p).includes(accountId)));
        
        let matchReason = '';
        if (isDirectMatch) matchReason = 'Direct Match (accountId)';
        else if (isTempoMatch) matchReason = `Tempo Identity Match (${wlTempoId})`;
        else if (isUpdateMatch) matchReason = 'Update Author Match';
        else if (isTempoApp && wl.properties?.some(p => JSON.stringify(p).includes(accountId))) {
          matchReason = 'Property Metadata Match';
        }

        if (isTempoApp && wlDate === dateStr) {
          console.log(`[JiraSync Debug] Tempo Log en ${issueKey}: Autor Original: ${wl.author.accountId}, UpdateAuthor: ${wl.updateAuthor?.accountId}, TempoProp ID: ${wlTempoId}. ¿Es tuyo?: ${isAuthor}`);
        }

        debugLogs.push({
          issue: issueKey,
          id: wl.id,
          author: wl.author.displayName,
          type: wl.author.accountType,
          time: wl.timeSpentSeconds / 3600,
          match: isAuthor,
          reason: matchReason || (isTempoApp ? 'Filtered (Not your account)' : 'Filtered'),
          rawData: wl
        });

        if (isAuthor) {
          totalSeconds += wl.timeSpentSeconds;
        }
      });
    }

    return {
      totalHours: totalSeconds / 3600,
      debugLogs: debugLogs
    };
  } catch (error) {
    console.error("Error fetching Jira worklogs:", error);
    throw error;
  }
};

/**
 * Obtiene los worklogs detallados del usuario en una fecha específica
 */
export const fetchDetailedWorklogs = async (email, apiToken, date) => {
  try {
    const myself = await validateJiraConnection(email, apiToken);
    const accountId = myself.accountId;

    const savedConfig = localStorage.getItem('syncronic_config');
    const tempoToken = savedConfig ? JSON.parse(savedConfig).tempoToken : null;

    if (tempoToken) {
      console.log(`[TempoSync] Usando API oficial de Tempo para historial detallado...`);
      const dateStr = formatDateLocal(date);
      try {
        const response = await axios.get(
          `${TEMPO_API_URL}/4/worklogs/user/${accountId}?from=${dateStr}&to=${dateStr}`,
          { headers: getTempoHeaders(tempoToken) }
        );
        const tempoResults = response.data.results || [];
        
        // Mapear Issue IDs a Keys en paralelo
        const detailed = await Promise.all(tempoResults.map(async (wl) => {
          const key = await resolveIssueKey(email, apiToken, wl.issue.id);
          return {
            id: wl.tempoWorklogId,
            issueKey: key,
            issueSummary: wl.description || 'Sincronizado vía Tempo',
            comment: wl.description || '',
            timeSpentSeconds: wl.timeSpentSeconds,
            started: `${wl.startDate}T${wl.startTime}`,
            authorAccountId: accountId
          };
        }));
        return detailed;
      } catch (e) {
        console.error(`[TempoSync] Error en API de Tempo (historial):`, e.message);
      }
    }

    const dateStr = formatDateLocal(date);

    // JQL Optimizado: Solo issues que TENGAN worklogs en esta fecha específica
    const jql = `worklogDate = "${dateStr}"`;
    console.log(`[JiraSync] JQL Detallado Optimizado: ${jql}`);

    const searchResponse = await axios.post(
      `${JIRA_API_URL}/rest/api/3/search/jql`,
      { jql, fields: ["key", "summary"], maxResults: 100 },
      { headers: getJiraHeaders(email, apiToken) }
    );

    const issues = searchResponse.data.issues || [];
    
    // Fetch worklogs with properties in batches to prevent 500 errors
    const results = [];
    const issueChunks = chunkArray(issues, 5); // Para el historial acepto 5 por lote
    
    for (const chunk of issueChunks) {
      if (results.length > 0) {
        await new Promise(r => setTimeout(r, 150));
      }
      const chunkPromises = chunk.map(async (issue) => {
        try {
          const response = await axios.get(
            `${JIRA_API_URL}/rest/api/3/issue/${issue.key}/worklog?expand=properties`,
            { headers: getJiraHeaders(email, apiToken) }
          );
          return { 
            key: issue.key, 
            summary: issue.fields.summary, 
            worklogs: response.data.worklogs || [] 
          };
        } catch (err) {
          return { key: issue.key, summary: issue.fields.summary, worklogs: [] };
        }
      });
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    // FASE DE DESCUBRIMIENTO: Encontrar el tempo_id y persistirlo
    let userTempoId = localStorage.getItem('syncronic_tempo_id');
    
    results.forEach(({ worklogs }) => {
      worklogs.forEach(wl => {
        if (wl.author?.accountId === accountId) {
          const tempoProp = wl.properties?.find(p => p.key === 'tempo');
          if (tempoProp?.value?.tempo_id) {
            userTempoId = tempoProp.value.tempo_id;
            localStorage.setItem('syncronic_tempo_id', userTempoId);
          }
        }
      });
    });

    // FASE DE DEEP DISCOVERY: Si aún no hay tempo_id, buscar en el historial reciente
    if (!userTempoId) {
      try {
        const deepJql = `worklogAuthor = "${accountId}" AND updated >= "-30d" ORDER BY updated DESC`;
        const deepRes = await axios.post(
          `${JIRA_API_URL}/rest/api/3/search/jql`,
          { jql: deepJql, fields: ["key"], maxResults: 10 },
          { headers: getJiraHeaders(email, apiToken) }
        );
        const deepIssues = deepRes.data.issues || [];
        for (const dIssue of deepIssues) {
          if (userTempoId) break;
          const wlRes = await axios.get(
            `${JIRA_API_URL}/rest/api/3/issue/${dIssue.key}/worklog?expand=properties`,
            { headers: getJiraHeaders(email, apiToken) }
          );
          const wls = wlRes.data.worklogs || [];
          for (const wl of wls) {
            if (wl.author?.accountId === accountId) {
              const tempoProp = wl.properties?.find(p => p.key === 'tempo');
              if (tempoProp?.value?.tempo_id) {
                userTempoId = tempoProp.value.tempo_id;
                localStorage.setItem('syncronic_tempo_id', userTempoId);
                break;
              }
            }
          }
        }
      } catch (e) {
        // Silent catch for history loader
      }
    }

    const detailedWorklogs = [];

    for (const { key: issueKey, summary, worklogs } of results) {
      worklogs.forEach(wl => {
        const wlDate = formatDateLocal(new Date(wl.started));
        if (wlDate !== dateStr) return;

        const isTempoApp = wl.author.accountType === 'app' && 
                          (wl.author.displayName?.toLowerCase().includes('tempo') || 
                           wl.author.displayName?.toLowerCase().includes('timesheets') ||
                           wl.author.displayName?.toLowerCase().includes('global'));
        
        const isDirectMatch = wl.author.accountId === accountId;
        const tempoProp = wl.properties?.find(p => p.key === 'tempo');
        const wlTempoId = tempoProp?.value?.tempo_id;
        const isTempoMatch = userTempoId && wlTempoId === userTempoId;
        const isUpdateMatch = wl.updateAuthor?.accountId === accountId;

        const isAuthor = isDirectMatch || isTempoMatch || isUpdateMatch ||
                         (isTempoApp && wl.properties?.some(p => JSON.stringify(p).includes(accountId)));

        if (isAuthor) {
          detailedWorklogs.push({
            id: wl.id,
            issueKey: issueKey,
            issueSummary: summary,
            comment: wl.comment?.content?.[0]?.content?.[0]?.text || '',
            timeSpentSeconds: wl.timeSpentSeconds,
            started: wl.started,
            authorAccountId: wl.author?.accountId
          });
        }
      });
    }

    return detailedWorklogs;
  } catch (error) {
    console.error("Error fetching detailed worklogs:", error);
    throw error;
  }
};

/**
 * Actualiza un worklog existente en Jira o Tempo según sea necesario
 */
export const updateJiraWorklog = async (email, apiToken, issueKey, worklogId, comment, timeSpentSeconds, startDate, authorAccountId) => {
  const savedConfig = localStorage.getItem('syncronic_config');
  const tempoConfig = savedConfig ? JSON.parse(savedConfig) : null;
  const tempoToken = tempoConfig?.tempoToken;

  // Intento 1: API de Jira (Tradicional)
  try {
    const response = await axios.put(
      `${JIRA_API_URL}/rest/api/3/issue/${issueKey}/worklog/${worklogId}`,
      {
        comment: {
          type: "doc",
          version: 1,
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: comment }]
          }]
        },
        timeSpentSeconds: timeSpentSeconds
      },
      { headers: getJiraHeaders(email, apiToken) }
    );
    return response.data;
  } catch (error) {
    // Si falla con 404 (indicativo de que es un worklog de Tempo) y tenemos token de Tempo
    if (error.response?.status === 404 && tempoToken) {
      console.log(`[Syncronic] 404 en Jira al actualizar ${worklogId}, reintentando vía API de Tempo...`);
      
      // Para Tempo PUT necesitamos: authorAccountId, description, startDate, timeSpentSeconds
      if (!authorAccountId || !startDate) {
        console.warn("[Syncronic] Faltan datos (authorAccountId o startDate) para reintento en Tempo.");
        throw error; // Re-lanzar el error original de Jira si no tenemos datos para Tempo
      }

      try {
        // Asegurar formato de fecha YYYY-MM-DD para Tempo
        const formattedDate = typeof startDate === 'string' ? startDate.split('T')[0] : formatDateLocal(startDate);

        const response = await axios.put(
          `${TEMPO_API_URL}/4/worklogs/${worklogId}`,
          {
            authorAccountId: authorAccountId,
            description: comment,
            startDate: formattedDate,
            timeSpentSeconds: timeSpentSeconds
          },
          { headers: getTempoHeaders(tempoToken) }
        );
        return response.data;
      } catch (tempoError) {
        console.error("Error updating via Tempo API:", tempoError.response?.data || tempoError.message);
        throw tempoError;
      }
    }
    console.error("Error updating Jira worklog:", error);
    throw error;
  }
};

/**
 * Elimina un worklog de Jira o Tempo según sea necesario
 */
export const deleteJiraWorklog = async (email, apiToken, issueKey, worklogId) => {
  const savedConfig = localStorage.getItem('syncronic_config');
  const tempoToken = savedConfig ? JSON.parse(savedConfig).tempoToken : null;

  // Intento 1: API de Jira (Tradicional)
  try {
    await axios.delete(
      `${JIRA_API_URL}/rest/api/3/issue/${issueKey}/worklog/${worklogId}`,
      { headers: getJiraHeaders(email, apiToken) }
    );
    return true;
  } catch (error) {
    // Si falla con 404 y tenemos token de Tempo, intentamos vía Tempo
    if (error.response?.status === 404 && tempoToken) {
      console.log(`[Syncronic] 404 en Jira para ${worklogId}, reintentando vía API de Tempo...`);
      try {
        await axios.delete(
          `${TEMPO_API_URL}/4/worklogs/${worklogId}`,
          { headers: getTempoHeaders(tempoToken) }
        );
        return true;
      } catch (tempoError) {
        console.error("Error deleting via Tempo API:", tempoError.message);
        throw tempoError;
      }
    }
    console.error("Error deleting Jira worklog:", error);
    throw error;
  }
};

/**
 * Busca issues en Jira para el autocompletado
 */
export const searchJiraIssues = async (email, apiToken, query) => {
  if (!query || query.length < 2) return [];

  try {
    const url = `${JIRA_API_URL}/rest/api/3/issue/picker?query=${encodeURIComponent(query)}&currentJQL=order%20by%20lastViewed%20DESC`;
    console.log(`[JiraAutocomplete] Buscando: "${query}" - URL: ${url}`);

    const response = await axios.get(url, {
      headers: getJiraHeaders(email, apiToken)
    });

    console.log(`[JiraAutocomplete] Respuesta recibida:`, response.data);

    const results = [];
    if (response.data && response.data.sections) {
      response.data.sections.forEach(section => {
        section.issues.forEach(issue => {
          results.push({
            key: issue.key,
            summary: issue.summaryText,
            html: issue.summary
          });
        });
      });
    }

    console.log(`[JiraAutocomplete] Resultados parseados: ${results.length}`);
    return results;
  } catch (error) {
    if (error.response) {
      console.error("[JiraAutocomplete] Error Response:", {
        status: error.response.status,
        data: error.response.data
      });
    }
    console.error("Error searching issues:", error);
    return [];
  }
};

/**
 * Genera el cuerpo del correo consolidado para múltiples actividades
 */
export const formatReportEmail = (day, activities) => {
  const dateStr = day.toLocaleDateString();
  let totalHours = 0;
  let body = `Hola equipo,\n\nHoy estuve trabajando en:\n\n`;

  activities.forEach(act => {
    if (act.issueKey && act.report) {
      body += `- ${act.report}\n`;
    }
  });

  body += `\nSaludos,\n[Tu Nombre]`;
  return body;
};

/**
 * Formatea solo las actividades (útil para el editor acumulativo)
 */
export const formatActivitySnippet = (activities) => {
  let snippet = '';
  activities.forEach(act => {
    if (act.issueKey && act.report) {
      snippet += `- ${act.report}\n`;
    }
  });
  return snippet;
};

/**
 * Obtiene los días de la semana actual
 */
export const getWeekDays = () => {
  const current = new Date();
  const week = [];
  current.setDate(current.getDate() - (current.getDay() === 0 ? 6 : current.getDay() - 1));

  for (let i = 0; i < 5; i++) {
    week.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return week;
};
