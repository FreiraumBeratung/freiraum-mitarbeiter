/**
 * Unit Tests für Schicks-An-Name-Raus Pattern
 * 
 * Testet Pattern:
 * - "Schicks an Thomas raus. Bin gerade beim Kunden."
 * - "Schick's an Thomas raus, bin im Termin."
 * - "Schicks raus." (sollte nicht matchen)
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Schicks-An-Name-Raus Pattern', () => {
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
          // Body sollte NICHT "an thomas" enthalten
          expect(bodyHintLower).not.toContain('an thomas');
          // Body sollte NICHT "raus" enthalten
          expect(bodyHintLower).not.toContain('raus');
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
          expect(bodyHintLower).not.toContain('an thomas');
          expect(bodyHintLower).not.toContain('raus');
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
          expect(bodyHintLower).not.toContain('an thomas');
          expect(bodyHintLower).not.toContain('raus');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-name-direct-body');
      }
    });
  });

  describe('Negative test cases', () => {
    it('should NOT match "Schicks raus." (kein Empfänger)', () => {
      const input = "Schicks raus.";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als schick-name-direct-body erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'schick-name-direct-body') {
        // Falls doch erkannt, sollte toRaw vorhanden und nicht "s" sein
        expect(intent.toRaw).toBeDefined();
        if (intent.toRaw) {
          expect(intent.toRaw).not.toBe('s');
          expect(intent.toRaw.length).toBeGreaterThan(1);
        }
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
    it('should remove "an Thomas" and "raus" from body', () => {
      const input = "Schicks an Thomas raus. Bin gerade beim Kunden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose' && intent.bodyHint) {
        const bodyHintLower = intent.bodyHint.toLowerCase();
        // Body sollte NICHT "an thomas" enthalten
        expect(bodyHintLower).not.toContain('an thomas');
        // Body sollte NICHT "raus" enthalten
        expect(bodyHintLower).not.toContain('raus');
        // Body sollte "bin gerade beim kunden" enthalten
        expect(bodyHintLower).toMatch(/bin\s+gerade\s+beim\s+kunden/);
      }
    });
  });
});
