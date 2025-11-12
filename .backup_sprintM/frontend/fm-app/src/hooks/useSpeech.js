export function useSpeech() {
  const support = typeof window !== "undefined" && "speechSynthesis" in window;
  let speakingRef = { current: false };

  function speak(text, { rate = 1, pitch = 1, volume = 1, lang = "de-DE", onstart, onend, voiceName } = {}) {
    if (!support || !text) return { ok: false, reason: "no_speech_api" };
    
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = rate;
      utter.pitch = pitch;
      utter.volume = volume;
      utter.lang = lang;
      
      // Versuche männliche Stimme zu finden
      const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          // Suche nach männlicher deutscher Stimme
          let maleVoice = voices.find(v => 
            v.lang.includes('de') && 
            (voiceName && v.name.toLowerCase().includes(voiceName.toLowerCase()))
          );
          
          if (!maleVoice) {
            // Fallback: Suche nach deutschen Stimmen ohne "female"
            maleVoice = voices.find(v => 
              v.lang.includes('de') && 
              !v.name.toLowerCase().includes('female') &&
              !v.name.toLowerCase().includes('anna') &&
              !v.name.toLowerCase().includes('katja')
            );
          }
          
          if (!maleVoice) {
            // Letzter Fallback: Erste deutsche Stimme
            maleVoice = voices.find(v => v.lang.includes('de'));
          }
          
          if (maleVoice) {
            utter.voice = maleVoice;
          }
        }
      };
      
      // Voices müssen geladen sein
      if (window.speechSynthesis.getVoices().length > 0) {
        setVoice();
      } else {
        window.speechSynthesis.onvoiceschanged = setVoice;
      }
      
      utter.onstart = () => {
        speakingRef.current = true;
        onstart && onstart();
      };
      
      utter.onend = () => {
        speakingRef.current = false;
        onend && onend();
      };
      
      window.speechSynthesis.cancel(); // stop any current
      window.speechSynthesis.speak(utter);
      
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }

  function stop() {
    if (support) window.speechSynthesis.cancel();
    speakingRef.current = false;
  }

  function isSpeaking() {
    return speakingRef.current;
  }

  return { support, speak, stop, isSpeaking };
}

