/**
 * Speech Manager: Prevents overlapping TTS/voice messages
 * 
 * Features:
 * - stopSpeech(): Cancels current speech
 * - speak(): Speaks text with optional interrupt
 * - speakKeyed(): Debounced speech by key (latest message wins)
 */

let currentUtterance: SpeechSynthesisUtterance | null = null;
const keyedTimeouts: Map<string, number> = new Map();

/**
 * Stops any currently playing speech
 */
export function stopSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  
  const synth = window.speechSynthesis;
  synth.cancel();
  currentUtterance = null;
}

/**
 * Speaks text with optional interrupt behavior
 * @param text - Text to speak
 * @param opts - Options: interrupt (default: true)
 */
export function speak(text: string, opts?: { interrupt?: boolean }): void {
  if (!text || !text.trim()) {
    return;
  }

  const shouldInterrupt = opts?.interrupt !== false;
  
  if (shouldInterrupt) {
    stopSpeech();
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('[speech-manager] WebSpeech API not available');
    return;
  }

  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const germanVoices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('de'));
  if (germanVoices.length > 0) {
    utterance.voice = germanVoices[0];
  }

  utterance.onend = () => {
    currentUtterance = null;
  };

  utterance.onerror = () => {
    currentUtterance = null;
  };

  if (synth.getVoices().length === 0) {
    synth.onvoiceschanged = () => {
      const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('de'));
      if (voices.length > 0) utterance.voice = voices[0];
      synth.speak(utterance);
    };
    return;
  }

  currentUtterance = utterance;
  synth.speak(utterance);
}

/**
 * Speaks text with key-based debouncing (150ms)
 * Only the latest message for a given key will be spoken.
 * @param key - Unique key for this message type
 * @param text - Text to speak
 */
export function speakKeyed(key: string, text: string): void {
  // Clear existing timeout for this key
  const existingTimeout = keyedTimeouts.get(key);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Set new timeout (debounce 150ms)
  const timeoutId = window.setTimeout(() => {
    stopSpeech();
    speak(text, { interrupt: true });
    keyedTimeouts.delete(key);
  }, 150);

  keyedTimeouts.set(key, timeoutId);
}

