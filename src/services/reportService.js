import axios from 'axios';

// Usamos un proxy de Vite para evitar problemas de CORS en desarrollo local
const JIRA_API_URL = '/jira-api';

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
    // 1. Obtener los datos del usuario actual para tener su accountId
    const myself = await validateJiraConnection(email, apiToken);
    const accountId = myself.accountId;

    // 2. Formatear la fecha para JQL: YYYY-MM-DD (usando componentes locales para evitar desfase de zona horaria)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    console.log(`[JiraSync] Buscando horas para la fecha: ${dateStr} (Local)`);

    // 3. Buscar issues donde el usuario haya imputado horas ese día
    // Migración a la nueva API /search/jql (POST) para evitar error 410 Gone
    const jql = `worklogDate = "${dateStr}" AND worklogAuthor = "${accountId}"`;
    console.log(`[JiraSync] JQL: ${jql}`);

    const searchResponse = await axios.post(
      `${JIRA_API_URL}/rest/api/3/search/jql`,
      {
        jql: jql,
        fields: ["key"],
        maxResults: 100
      },
      { headers: getJiraHeaders(email, apiToken) }
    );

    const issues = searchResponse.data.issues || [];
    console.log(`[JiraSync] Issues encontrados: ${issues.length}`);
    let totalSeconds = 0;

    // 4. Para cada issue, obtener sus worklogs y filtrar los del usuario y fecha
    for (const issue of issues) {
      const worklogResponse = await axios.get(
        `${JIRA_API_URL}/rest/api/3/issue/${issue.key}/worklog`,
        { headers: getJiraHeaders(email, apiToken) }
      );

      const worklogs = worklogResponse.data.worklogs || [];
      worklogs.forEach(wl => {
        const wlDate = wl.started.split('T')[0];
        if (wlDate === dateStr && (wl.author.accountId === accountId || wl.author.emailAddress === email)) {
          totalSeconds += wl.timeSpentSeconds;
        }
      });
    }

    return totalSeconds / 3600; // Retornar en horas
  } catch (error) {
    if (error.response) {
      console.error("Jira API Error Response Full:", {
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data,
        message: error.response.data?.errorMessages || error.response.data?.errors
      });
    }
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

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const jql = `worklogDate = "${dateStr}" AND worklogAuthor = "${accountId}"`;
    const searchResponse = await axios.post(
      `${JIRA_API_URL}/rest/api/3/search/jql`,
      { jql, fields: ["key", "summary"], maxResults: 100 },
      { headers: getJiraHeaders(email, apiToken) }
    );

    const issues = searchResponse.data.issues || [];
    const detailedWorklogs = [];

    for (const issue of issues) {
      const worklogResponse = await axios.get(
        `${JIRA_API_URL}/rest/api/3/issue/${issue.key}/worklog`,
        { headers: getJiraHeaders(email, apiToken) }
      );

      const worklogs = worklogResponse.data.worklogs || [];
      worklogs.forEach(wl => {
        const wlDate = wl.started.split('T')[0];
        if (wlDate === dateStr && (wl.author.accountId === accountId || wl.author.emailAddress === email)) {
          detailedWorklogs.push({
            id: wl.id,
            issueKey: issue.key,
            issueSummary: issue.fields.summary,
            comment: wl.comment?.content?.[0]?.content?.[0]?.text || '',
            timeSpentSeconds: wl.timeSpentSeconds,
            started: wl.started
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
 * Actualiza un worklog existente en Jira
 */
export const updateJiraWorklog = async (email, apiToken, issueKey, worklogId, comment, timeSpentSeconds) => {
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
    console.error("Error updating Jira worklog:", error);
    throw error;
  }
};

/**
 * Elimina un worklog de Jira
 */
export const deleteJiraWorklog = async (email, apiToken, issueKey, worklogId) => {
  try {
    await axios.delete(
      `${JIRA_API_URL}/rest/api/3/issue/${issueKey}/worklog/${worklogId}`,
      { headers: getJiraHeaders(email, apiToken) }
    );
    return true;
  } catch (error) {
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
