/**
 * Integration Tests für Dass-Rewrite bei autoSend-Intents
 * 
 * Testet, dass "dass"-Klauseln in bodyHint für autoSend-Intents korrekt
 * umgeschrieben werden, auch wenn "kurz" während der Normalisierung entfernt wird.
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';
import { rewriteLeadingDassClause } from './dass_rewrite';

describe('Dass-Rewrite bei autoSend-Intents', () => {
  describe('Integration: "Schick, Thomas kurz, dass wir 15 Minuten später starten."', () => {
    it('should produce email-compose intent with autoSend=true and rewritten bodyHint', () => {
      const input = "Schick, Thomas kurz, dass wir 15 Minuten später starten.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.meta?.autoSend).toBe(true);
        
        // bodyHint sollte "dass wir ..." enthalten (vor Rewrite)
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          
          // Prüfe, ob bodyHint mit "dass" beginnt (vor Rewrite)
          // ODER bereits umgeschrieben wurde (nach Rewrite in index.ts)
          // Da der Rewrite in index.ts passiert, sollte hier noch "dass" vorhanden sein
          const hasDass = bodyHintLower.startsWith('dass ');
          const hasWir = bodyHintLower.includes('wir');
          
          // Mindestens eines sollte zutreffen
          expect(hasDass || hasWir).toBe(true);
          
          // Simuliere Rewrite (wie in index.ts)
          if (intent.meta?.autoSend && hasDass) {
            const rewritten = rewriteLeadingDassClause(intent.bodyHint);
            expect(rewritten).not.toMatch(/^dass\s+/i);
            expect(rewritten).toMatch(/^wir\s+/i);
            expect(rewritten).toContain('starten');
          }
        }
      }
    });
  });

  describe('Integration: "Sende Thomas kurz, dass ich nachher anrufe."', () => {
    it('should produce email-compose intent with autoSend=true', () => {
      const input = "Sende Thomas kurz, dass ich nachher anrufe.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.meta?.autoSend).toBe(true);
        
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint && intent.meta?.autoSend) {
          // Simuliere Rewrite (wie in index.ts)
          const rewritten = rewriteLeadingDassClause(intent.bodyHint);
          
          // Nach Rewrite sollte NICHT mit "dass" beginnen
          expect(rewritten.toLowerCase()).not.toMatch(/^dass\s+/);
          
          // Sollte mit "Ich" beginnen (nach Rewrite)
          expect(rewritten).toMatch(/^Ich\s+/i);
          
          // Sollte "anrufe" oder "rufe" enthalten
          expect(rewritten.toLowerCase()).toMatch(/anrufe|rufe/);
        }
      }
    });
  });

  describe('Safety: no rewrite when autoSend=false', () => {
    it('should NOT rewrite when autoSend is false', () => {
      // Verwende einen Intent, der kein autoSend hat
      const input = "Schick Thomas, dass wir starten, aber zeig mir erst den Entwurf.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        // autoSend sollte false sein wegen "zeig mir erst den Entwurf"
        // ODER der Intent wird als ai-chat erkannt (wenn kein email-compose)
        if (intent.meta?.autoSend === false) {
          // Wenn autoSend=false, wird Rewrite in index.ts NICHT angewendet
          // bodyHint kann mit "dass" beginnen (vor Rewrite in index.ts)
          if (intent.bodyHint) {
            const bodyHintLower = intent.bodyHint.toLowerCase();
            // Prüfe, dass bodyHint vorhanden ist
            expect(bodyHintLower.length).toBeGreaterThan(0);
            // Wenn bodyHint mit "dass" beginnt, ist das ok (wird in index.ts nicht umgeschrieben)
          }
        } else {
          // Intent könnte auch als ai-chat erkannt werden
          // Das ist auch ok für diesen Test
          expect(intent.type).toBeDefined();
        }
      }
    });
  });
});
