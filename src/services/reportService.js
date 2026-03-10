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
    'X-Atlassian-Token': 'no-check', // Obligatorio para evitar XSRF en proxies/navegadores
    'X-Requested-With': 'XMLHttpRequest' // Refuerzo para evitar bloqueos de seguridad
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
 * Busca issues en Jira para el autocompletado
 */
export const searchJiraIssues = async (email, apiToken, query) => {
  if (!query || query.length < 2) return [];

  try {
    const response = await axios.get(
      `${JIRA_API_URL}/rest/api/3/issue/picker?query=${encodeURIComponent(query)}&currentJQL=order%20by%20lastViewed%20DESC`,
      {
        headers: getJiraHeaders(email, apiToken)
      }
    );

    const results = [];
    response.data.sections.forEach(section => {
      section.issues.forEach(issue => {
        results.push({
          key: issue.key,
          summary: issue.summaryText,
          html: issue.summary
        });
      });
    });

    return results;
  } catch (error) {
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
      const hours = parseFloat(act.hours) || 0;
      totalHours += hours;
      body += `- [${act.issueKey}] (${hours}h): ${act.report}\n`;
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
      const hours = parseFloat(act.hours) || 0;
      snippet += `- [${act.issueKey}] (${hours}h): ${act.report}\n`;
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
