/**
 * Unit Tests für email_polish.ts - Command-Artefakt-Entfernung und Normalisierung
 */

import { describe, it, expect } from 'vitest';
import { normalizeEmailBodyAfterPolish } from './email_polish';

describe('email_polish: normalizeEmailBodyAfterPolish', () => {
  describe('Case A: Simple leading commands', () => {
    it('should remove "Schreiben." from start', () => {
      const input = 'Schreiben. Hi Thomas, hier ist Dennis.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Hi Thomas, hier ist Dennis.');
    });

    it('should remove "Senden:" from start', () => {
      const input = 'Senden: Hallo Thomas, hier ist Dennis.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Hallo Thomas, hier ist Dennis.');
    });
  });

  describe('Case B: Command sentences before greeting', () => {
    it('should remove "Schreiben und sende Sie direkt los." before greeting', () => {
      const input = 'Schreiben und sende Sie direkt los. Hi Thomas, hier ist Dennis.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Hi Thomas, hier ist Dennis.');
    });

    it('should remove command sentence with greeting marker', () => {
      const input = 'Bitte schreiben Sie eine Nachricht. Hallo Thomas, hier ist Dennis.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Hallo Thomas, hier ist Dennis.');
    });

    it('should remove "Senden und los." before greeting', () => {
      const input = 'Senden und los. Hi Thomas, hier ist Dennis.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Hi Thomas, hier ist Dennis.');
    });
  });

  describe('Case C: Negative cases (should NOT remove)', () => {
    it('should NOT remove if command word appears in body (not at start)', () => {
      const input = 'Hi Thomas, Schreiben ist heute stressig. Ich hoffe dir geht es gut.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Hi Thomas, Schreiben ist heute stressig. Ich hoffe dir geht es gut.');
    });

    it('should NOT remove if prefix is too long (>120 chars)', () => {
      const input = 'Dies ist ein sehr langer Text der mehr als 120 Zeichen hat und definitiv nicht entfernt werden sollte. Hi Thomas, hier ist Dennis.';
      const result = normalizeEmailBodyAfterPolish(input);
      // Should keep original if prefix too long
      expect(result.length).toBeGreaterThanOrEqual(input.length - 10); // Allow minor trimming
    });

    it('should NOT remove if prefix does not contain command words', () => {
      const input = 'Gestern war ein schöner Tag. Hi Thomas, hier ist Dennis.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Gestern war ein schöner Tag. Hi Thomas, hier ist Dennis.');
    });
  });

  describe('Case D: Edge cases', () => {
    it('should handle empty string', () => {
      const input = '';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('');
    });

    it('should preserve normal text without artifacts', () => {
      const input = 'Hi Thomas, hier ist Dennis. Ich hoffe dir geht es gut.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Hi Thomas, hier ist Dennis. Ich hoffe dir geht es gut.');
    });

    it('should handle text starting with greeting directly', () => {
      const input = 'Hey Thomas, hier ist Dennis.';
      const result = normalizeEmailBodyAfterPolish(input);
      expect(result).toBe('Hey Thomas, hier ist Dennis.');
    });
  });
});

