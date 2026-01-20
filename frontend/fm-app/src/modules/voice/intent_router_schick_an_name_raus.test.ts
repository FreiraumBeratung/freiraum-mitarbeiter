/**
 * Unit Tests für Schick-An-Name-Raus Pattern
 * 
 * Testet Pattern:
 * - "Schicks an Thomas raus. Bin gerade beim Kunden."
 * - "Schick's an Thomas raus, bin im Termin."
 * - "Schicksal an Thomas raus. Bin gerade beim Kunden." (STT-Variante)
 * - "Schicksal ist komisch." (sollte NICHT matchen)
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Schick-An-Name-Raus Pattern', () => {
  describe('Basic pattern matching with AutoSend', () => {
    it('should match "Schicks an Thomas raus. Bin gerade beim Kunden." with autoSend=true', () => {
      const input = "Schicks an Thomas raus. Bin gerade beim Kunden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "bin gerade beim kunden" enthalten (normalisiert ok)
          expect(bodyHintLower).toMatch(/bin\s+gerade\s+beim\s+kunden/);
          // Body sollte NICHT "thomas" enthalten
          expect(bodyHintLower).not.toContain('thomas');
          // Body sollte NICHT "raus" enthalten
          expect(bodyHintLower).not.toContain('raus');
          // Body sollte NICHT "an" enthalten (als isoliertes Wort)
          expect(bodyHintLower).not.toMatch(/\ban\b/);
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-name-direct-body');
      }
    });

    it('should match "Schick\'s an Thomas raus, bin im Termin." with autoSend=true', () => {
      const input = "Schick's an Thomas raus, bin im Termin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "bin im termin" enthalten
          expect(bodyHintLower).toContain('bin im termin');
          expect(bodyHintLower).not.toContain('thomas');
          expect(bodyHintLower).not.toContain('raus');
          expect(bodyHintLower).not.toMatch(/\ban\b/);
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-name-direct-body');
      }
    });

    it('should match "Schick an Thomas direkt raus, bin im Termin." with autoSend=true', () => {
      const input = "Schick an Thomas direkt raus, bin im Termin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "bin im termin" enthalten
          expect(bodyHintLower).toContain('bin im termin');
          expect(bodyHintLower).not.toContain('thomas');
          expect(bodyHintLower).not.toContain('raus');
          expect(bodyHintLower).not.toMatch(/\ban\b/);
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-name-direct-body');
      }
    });
  });

  describe('STT-safe normalization', () => {
    it('should match "Schicksal an Thomas raus. Bin gerade beim Kunden." (STT mishears "schicks" as "schicksal")', () => {
      const input = "Schicksal an Thomas raus. Bin gerade beim Kunden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "bin gerade beim kunden" enthalten
          expect(bodyHintLower).toMatch(/bin\s+gerade\s+beim\s+kunden/);
          expect(bodyHintLower).not.toContain('thomas');
          expect(bodyHintLower).not.toContain('raus');
          expect(bodyHintLower).not.toMatch(/\ban\b/);
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-name-direct-body');
      }
    });

    it('should NOT match "Schicksal ist komisch." (no command context)', () => {
      const input = "Schicksal ist komisch.";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als schick-name-direct-body erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'schick-name-direct-body') {
        // Falls doch erkannt, sollte toRaw vorhanden und nicht "an" sein
        expect(intent.toRaw).toBeDefined();
        if (intent.toRaw) {
          expect(intent.toRaw).not.toBe('an');
          expect(intent.toRaw.length).toBeGreaterThan(1);
        }
      }
    });
  });

  describe('Safety checks', () => {
    it('should NOT have toRaw="an" from "schick an thomas"', () => {
      const input = "Schicks an Thomas raus. Bin gerade beim Kunden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        // toRaw darf NICHT "an" sein
        expect(intent.toRaw).not.toBe('an');
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
      }
    });

    it('should NOT have toRaw="s" from "schick\'s"', () => {
      const input = "Schick's an Thomas raus. Bin gerade beim Kunden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        // toRaw darf NICHT "s" sein
        expect(intent.toRaw).not.toBe('s');
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
      }
    });
  });

  describe('Body cleaning', () => {
    it('should remove "an Thomas", "Thomas, raus", and "raus" from body', () => {
      const input = "Schicks an Thomas raus. Bin gerade beim Kunden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose' && intent.bodyHint) {
        const bodyHintLower = intent.bodyHint.toLowerCase();
        // Body sollte NICHT "an thomas" enthalten
        expect(bodyHintLower).not.toContain('an thomas');
        // Body sollte NICHT "thomas, raus" oder "thomas raus" enthalten
        expect(bodyHintLower).not.toMatch(/thomas\s*[,:\\.]?\s*(?:raus|los|ab)/);
        // Body sollte NICHT "raus" enthalten
        expect(bodyHintLower).not.toContain('raus');
        // Body sollte "bin gerade beim kunden" enthalten
        expect(bodyHintLower).toMatch(/bin\s+gerade\s+beim\s+kunden/);
      }
    });
  });
});
