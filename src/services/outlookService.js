import { PublicClientApplication } from "@azure/msal-browser";

// Configuración de MSAL
// El clientId debe ser proporcionado por el usuario tras registrar la app en Azure
export const msalConfig = {
    auth: {
        clientId: localStorage.getItem('outlookClientId') || "YOUR_CLIENT_ID_HERE",
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    },
};

// Scopes para enviar correos
export const loginRequest = {
    scopes: ["User.Read", "Mail.Send", "Mail.ReadWrite"],
};

export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Servicio para interactuar con Microsoft Graph
 */
export const sendOutlookEmail = async (accessToken, recipient, subject, body) => {
    const url = "https://graph.microsoft.com/v1.0/me/sendMail";

    const emailContent = {
        message: {
            subject: subject,
            body: {
                contentType: "Text",
                content: body,
            },
            toRecipients: [
                {
                    emailAddress: {
                        address: recipient || "",
                    },
                },
            ],
        },
        saveToSentItems: "true",
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(emailContent),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error.message || "Error al enviar el correo via Outlook");
    }

    return true;
};
