/**
 * Parser für "Sende/Schick ... nicht senden" -> Preview-only Intent
 * 
 * Erkennt Sätze mit Send-Verb + Negation und konvertiert sie zu Preview-only Email-Intents.
 * Normalized Text ist bereits lowercase und ohne Umlaute.
 */

export function tryParseCancelledSendToPreview(normalized: string): null | { toName: string; bodyHint: string } {
  if (!normalized || typeof normalized !== 'string') {
    return null;
  }

  const text = normalized.trim();
  if (!text) {
    return null;
  }

  // 1) Muss Cancel-Signal enthalten: Negation ODER Stop-Kommando
  const negationPattern = /\bnicht\s+(?:senden|schicken|abschicken|rausschicken|verschicken)\b/i;
  // Stop-Kommando: nur wenn stop/stopp am Ende als eigenes Kommando steht (optional nach Punkt/Komma/Satzende)
  // ODER als letztes Wort im Text (nach Leerzeichen)
  // NICHT wenn es Teil eines anderen Wortes ist (stoppst, stoppe) oder mitten im Satz
  const stopCommandPattern = /(?:\s+|^|[.!?]\s*|,\s*)\b(?:stopp|stop)\b\s*$/i;
  
  const hasNegation = negationPattern.test(text);
  const hasStopCommand = stopCommandPattern.test(text);
  
  if (!hasNegation && !hasStopCommand) {
    return null;
  }

  // 2) Muss ein Send-Verb am Anfang haben
  const sendVerbs = ['sende', 'senden', 'send', 'schick', 'schicke', 'schicken', 'abschicken', 'rausschicken', 'verschicken', 'sendern'];
  const verbPattern = new RegExp(`^(${sendVerbs.join('|')})\\s+`, 'i');
  const verbMatch = text.match(verbPattern);
  
  if (!verbMatch) {
    return null;
  }

  // 3) Parse-Schema: <verb> (an)? <name> <rest> oder <verb> folgende nachricht an <name> <rest>
  const afterVerb = text.slice(verbMatch[0].length).trim();
  
  let afterPrep = afterVerb;
  let nameStart = 0;
  
  // Sonderbehandlung: "sende folgende nachricht an <name>"
  if (afterVerb.startsWith('folgende nachricht an ')) {
    afterPrep = afterVerb.slice('folgende nachricht an '.length).trim();
    nameStart = verbMatch[0].length + 'folgende nachricht an '.length;
  }
  // Optional "an" nach dem Verb
  else if (afterVerb.startsWith('an ')) {
    afterPrep = afterVerb.slice(3).trim();
    nameStart = verbMatch[0].length + 3;
  } else {
    nameStart = verbMatch[0].length;
  }

  if (!afterPrep) {
    return null;
  }

  // Extrahiere Name (1 Token)
  const tokens = afterPrep.split(/\s+/);
  if (tokens.length === 0) {
    return null;
  }

  const toName = tokens[0].trim();
  if (!toName || toName.length === 0) {
    return null;
  }

  // Rest = alles nach dem Namen
  const rest = tokens.slice(1).join(' ').trim();
  if (!rest || rest.length === 0) {
    return null;
  }

  // 4) Body-Cleaning
  let bodyHint = rest;

  // Entferne Stop-Wörter (stopp, stop) als eigenständige Wörter (nicht Teil eines anderen Wortes)
  // Ersetze " stop " oder " stopp " oder am Ende " stop" / " stopp" oder am Anfang "stop " / "stopp "
  bodyHint = bodyHint.replace(/\s+\b(?:stopp|stop)\b\s*/gi, ' ').trim();
  bodyHint = bodyHint.replace(/\s+\b(?:stopp|stop)\b$/i, '').trim();
  bodyHint = bodyHint.replace(/^(?:stopp|stop)\b\s+/i, '').trim();

  // Entferne die Negationsphrase
  bodyHint = bodyHint.replace(/\bnicht\s+(?:senden|schicken|abschicken|rausschicken|verschicken)\b/gi, '').trim();

  // Entferne führende/mehrfache Leerzeichen und Satzzeichen
  bodyHint = bodyHint.replace(/^[,.:\-\s]+/, '').trim();
  bodyHint = bodyHint.replace(/\s+/g, ' ').trim();

  if (!bodyHint || bodyHint.length === 0) {
    return null;
  }

  // Erste Buchstabe groß
  bodyHint = bodyHint.charAt(0).toUpperCase() + bodyHint.slice(1);

  // Stelle sicher, dass Body mit Satzzeichen endet
  if (!/[.!?]$/.test(bodyHint)) {
    bodyHint += '.';
  }

  return {
    toName: toName,
    bodyHint: bodyHint,
  };
}
