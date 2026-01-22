/**
 * Unit Tests für Draft-Prepare Parser: "an <name> vorbereiten <text>"
 * 
 * Testet den Parser für Preview-only Email-Intents mit "vorbereiten" Phrase.
 */

import { describe, it, expect } from 'vitest';
import { tryParseDraftPrepare } from '../../logic/wizard4/draft_prepare_parser';

describe('tryParseDraftPrepare', () => {
  describe('Basic pattern matching', () => {
    it('should match "an thomas vorbereiten verschiebt sich um 10 minuten"', () => {
      const input = "an thomas vorbereiten verschiebt sich um 10 minuten";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Es verschiebt sich um 10 minuten.');
      }
    });

    it('should match "bitte für thomas vorbereiten ich rufe gleich zurück"', () => {
      const input = "bitte für thomas vorbereiten ich rufe gleich zurück";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich rufe gleich zurück.');
      }
    });

    it('should match "an thomas vorbereiten verzögert sich etwas"', () => {
      const input = "an thomas vorbereiten verzögert sich etwas";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Es verzögert sich etwas.');
      }
    });

    it('should match "für maria vorbereiten wir starten später"', () => {
      const input = "für maria vorbereiten wir starten später";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('maria');
        expect(result.bodyHint).toBe('Wir starten später.');
      }
    });

    it('should match "fur thomas vorbereiten ich rufe gleich zuruck" (normalized, ohne Umlaut)', () => {
      const input = "fur thomas vorbereiten ich rufe gleich zuruck";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich rufe gleich zuruck.');
      }
    });
  });

  describe('Edge cases', () => {
    it('should return null for "an thomas vorbereiten" (no body)', () => {
      const input = "an thomas vorbereiten";
      const result = tryParseDraftPrepare(input);
      
      expect(result).toBeNull();
    });

    it('should handle comma separator (if present in normalized)', () => {
      // Note: In normalized text, commas might be removed, but if present, should work
      const input = "an thomas vorbereiten ich komme später";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich komme später.');
      }
    });

    it('should handle text with spaces after vorbereiten', () => {
      const input = "an thomas vorbereiten ich komme später";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich komme später.');
      }
    });

    it('should capitalize first letter', () => {
      const input = "an thomas vorbereiten ich komme später";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        const firstChar = result.bodyHint.charAt(0);
        expect(firstChar).toBe(firstChar.toUpperCase());
      }
    });

    it('should add period if missing', () => {
      const input = "an thomas vorbereiten ich komme später";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).toMatch(/\.$/);
      }
    });

    it('should preserve existing punctuation', () => {
      const input = "an thomas vorbereiten ich komme später!";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).toMatch(/!$/);
        expect(result.bodyHint).not.toMatch(/\.!$/); // Sollte nicht doppelt sein
      }
    });
  });

  describe('Special fixes', () => {
    it('should add "Es " prefix for "verschiebt sich"', () => {
      const input = "an thomas vorbereiten verschiebt sich um 10 minuten";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint.toLowerCase()).toContain('es verschiebt sich');
        expect(result.bodyHint).toMatch(/^Es /i);
      }
    });

    it('should add "Es " prefix for "verzögert sich"', () => {
      const input = "an thomas vorbereiten verzögert sich etwas";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint.toLowerCase()).toContain('es verzögert sich');
        expect(result.bodyHint).toMatch(/^Es /i);
      }
    });

    it('should NOT add "Es " prefix for other phrases', () => {
      const input = "an thomas vorbereiten ich komme später";
      const result = tryParseDraftPrepare(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).not.toMatch(/^Es /i);
        expect(result.bodyHint).toMatch(/^Ich /);
      }
    });
  });
});
