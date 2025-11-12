// Centralized Error Handler
export function handleError(error, context = "") {
  console.error(`[Error${context ? ` in ${context}` : ""}]:`, error);
  
  // Network errors
  if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
    return "Verbindungsfehler: Backend nicht erreichbar. Bitte überprüfe, ob der Server läuft.";
  }
  
  // HTTP errors
  if (error.status) {
    if (error.status === 404) {
      return "Ressource nicht gefunden.";
    }
    if (error.status === 500) {
      return "Serverfehler. Bitte versuche es später erneut.";
    }
    if (error.status >= 400 && error.status < 500) {
      return `Fehler: ${error.status} - ${error.message || "Ungültige Anfrage"}`;
    }
  }
  
  // Generic error
  return error.message || "Ein unbekannter Fehler ist aufgetreten.";
}

// Safe API call wrapper
export async function safeApiCall(fn, context = "") {
  try {
    return await fn();
  } catch (error) {
    const message = handleError(error, context);
    console.error(message);
    throw new Error(message);
  }
}
















