/**
 * Unit Tests für Cancel-Preview Parser: "sende/schick ... nicht senden" -> Preview-only
 * 
 * Testet den Parser für Preview-only Email-Intents mit Send-Verb + Negation.
 */

import { describe, it, expect } from 'vitest';
import { tryParseCancelledSendToPreview } from './cancel_preview_parser';

describe('tryParseCancelledSendToPreview', () => {
  describe('Basic pattern matching', () => {
    it('should match "sendern thomas ich komme spater stop nicht senden"', () => {
      const input = "sendern thomas ich komme spater stop nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich komme spater.');
      }
    });

    it('should match "sende an thomas hi thomas hier ist denis stopp nicht schicken"', () => {
      const input = "sende an thomas hi thomas hier ist denis stopp nicht schicken";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Hi thomas hier ist denis.');
      }
    });

    it('should match "schick thomas ich komme spater nicht senden"', () => {
      const input = "schick thomas ich komme spater nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich komme spater.');
      }
    });

    it('should match "sende an maria wir starten spater nicht abschicken"', () => {
      const input = "sende an maria wir starten spater nicht abschicken";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('maria');
        expect(result.bodyHint).toBe('Wir starten spater.');
      }
    });
  });

  describe('Negation requirement', () => {
    it('should return null for "sende thomas ich komme spater" (no negation)', () => {
      const input = "sende thomas ich komme spater";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).toBeNull();
    });

    it('should return null for "schick thomas ich komme spater" (no negation)', () => {
      const input = "schick thomas ich komme spater";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).toBeNull();
    });
  });

  describe('Body cleaning', () => {
    it('should remove "stop" from body', () => {
      const input = "sende thomas ich komme spater stop nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).not.toContain('stop');
        expect(result.bodyHint).toBe('Ich komme spater.');
      }
    });

    it('should remove "stopp" from body', () => {
      const input = "sende thomas ich komme spater stopp nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).not.toContain('stopp');
        expect(result.bodyHint).toBe('Ich komme spater.');
      }
    });

    it('should remove negation phrase from body', () => {
      const input = "sende thomas ich komme spater nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).not.toContain('nicht senden');
        expect(result.bodyHint).toBe('Ich komme spater.');
      }
    });

    it('should capitalize first letter', () => {
      const input = "sende thomas ich komme spater nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        const firstChar = result.bodyHint.charAt(0);
        expect(firstChar).toBe(firstChar.toUpperCase());
      }
    });

    it('should add period if missing', () => {
      const input = "sende thomas ich komme spater nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.bodyHint).toMatch(/\.$/);
      }
    });
  });

  describe('Edge cases', () => {
    it('should return null if no body after cleaning', () => {
      const input = "sende thomas stop nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).toBeNull();
    });

    it('should handle "an" preposition', () => {
      const input = "sende an thomas ich komme spater nicht senden";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Ich komme spater.');
      }
    });

    it('should match "sende thomas hi thomas hier ist dennis stopp" (stop as cancel signal)', () => {
      const input = "sende thomas hi thomas hier ist dennis stopp";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toMatch(/^Hi thomas hier ist dennis\.$/);
      }
    });

    it('should return null for "stopp" alone (no send verb)', () => {
      const input = "stopp";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).toBeNull();
    });

    it('should return null for "sende thomas hi stoppst manchmal" (stop not as command, part of word)', () => {
      const input = "sende thomas hi stoppst manchmal";
      const result = tryParseCancelledSendToPreview(input);
      
      // "stoppst" enthält "stopp" als Teil eines anderen Wortes, sollte nicht als Cancel-Signal erkannt werden
      // Aber das Pattern /\b(?:stopp|stop)\b/ würde "stopp" in "stoppst" nicht matchen (wegen \b)
      // Also sollte es null sein, weil kein Cancel-Signal vorhanden
      expect(result).toBeNull();
    });

    it('should match "sende thomas hi. stopp" (stop as final command)', () => {
      const input = "sende thomas hi. stopp";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toBe('Hi.');
      }
    });

    it('should match "sende folgende nachricht an thomas hi hier ist dennis. stopp"', () => {
      const input = "sende folgende nachricht an thomas hi hier ist dennis. stopp";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.toName).toBe('thomas');
        expect(result.bodyHint).toMatch(/^Hi hier ist dennis\.$/);
      }
    });

    it('should return null for "sende folgende nachricht an thomas hi hier ist dennis" (no cancel signal)', () => {
      const input = "sende folgende nachricht an thomas hi hier ist dennis";
      const result = tryParseCancelledSendToPreview(input);
      
      expect(result).toBeNull();
    });
  });
});
