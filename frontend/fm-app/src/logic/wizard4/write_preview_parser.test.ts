/**
 * Unit Tests für Write-Preview Parser: "schreib (an|für|fur|fuer) <name> (aber )?nicht senden <text>"
 * 
 * Testet den Parser für Preview-only Email-Intents mit "schreib ... nicht senden" Phrase.
 */

import { describe, it, expect } from 'vitest';
import { tryParseWritePreview } from './write_preview_parser';

describe('tryParseWritePreview', () => {
  describe('Basic pattern matching', () => {
    it('should match "schreib fur thomas aber nicht senden ich bin gleich da"', () => {
      const input = "schreib fur thomas aber nicht senden ich bin gleich da";
      const result = tryParseWritePreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich bin gleich da.');
      }
    });

    it('should match "schreib an thomas nicht senden verschiebt sich um 10 minuten"', () => {
      const input = "schreib an thomas nicht senden verschiebt sich um 10 minuten";
      const result = tryParseWritePreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Verschiebt sich um 10 minuten.');
      }
    });

    it('should match "schreib für maria aber nicht schicken wir starten später"', () => {
      const input = "schreib für maria aber nicht schicken wir starten später";
      const result = tryParseWritePreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('maria');
        expect(result.bodyHint).toBe('Wir starten später.');
      }
    });

    it('should match "schreib fuer thomas nicht senden ich komme später"', () => {
      const input = "schreib fuer thomas nicht senden ich komme später";
      const result = tryParseWritePreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich komme später.');
      }
    });
  });

  describe('Edge cases', () => {
    it('should return null for "schreib fur thomas aber nicht senden" (no body)', () => {
      const input = "schreib fur thomas aber nicht senden";
      const result = tryParseWritePreview(input);
      
      expect(result).toBeNull();
    });

    it('should handle text with punctuation after "nicht senden"', () => {
      const input = "schreib an thomas nicht senden, ich komme später";
      const result = tryParseWritePreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich komme später.');
      }
    });

    it('should capitalize first letter', () => {
      const input = "schreib fur thomas nicht senden ich komme später";
      const result = tryParseWritePreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        const firstChar = result.bodyHint.charAt(0);
        expect(firstChar).toBe(firstChar.toUpperCase());
      }
    });

    it('should add period if missing', () => {
      const input = "schreib an thomas nicht senden ich komme später";
      const result = tryParseWritePreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).toMatch(/\.$/);
      }
    });

    it('should preserve existing punctuation', () => {
      const input = "schreib fur thomas nicht senden ich komme später!";
      const result = tryParseWritePreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).toMatch(/!$/);
        expect(result.bodyHint).not.toMatch(/\.!$/); // Sollte nicht doppelt sein
      }
    });
  });
});
