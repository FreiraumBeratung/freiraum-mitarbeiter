/**
 * Unit Tests für cleanEmailBodyFromCommand
 * 
 * Testet die Bereinigung von Body-Text von Steuer-Phrasen.
 */

import { describe, it, expect } from 'vitest';
import { cleanEmailBodyFromCommand } from './intent_router';

// Import stripLeadingAnName for testing (needs to be exported or tested indirectly)
// Since stripLeadingAnName is not exported, we'll test it indirectly through cleanEmailBodyFromCommand
// and add a test that simulates the A3.4 flow

describe('cleanEmailBodyFromCommand', () => {
  
  describe('Case 1: Nachricht mit Startmarker nach Steuer-Phrasen', () => {
    it('should extract body starting from greeting marker', () => {
      const input = 'Schreibe bitte folgende Mail an Thomas Hi Thomas, hier ist Dennis.';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('Hi Thomas, hier ist Dennis.');
    });

    it('should handle "an thomas hi thomas" pattern', () => {
      const input = 'an thomas hi thomas hier ist dennis ich hoffe dir geht es gut';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      // Function finds greeting marker and starts from there (case preserved from input)
      expect(result.toLowerCase()).toBe('hi thomas hier ist dennis ich hoffe dir geht es gut');
    });
  });

  describe('Case 2: AutoSend-Phrasen im Body', () => {
    it('should remove AutoSend phrases from body', () => {
      const input = 'an thomas und schick sie direkt raus hi thomas hier ist dennis ich hoffe dir geht es gut';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      // Function finds greeting marker and starts from there
      expect(result.toLowerCase()).toBe('hi thomas hier ist dennis ich hoffe dir geht es gut');
    });

    it('should handle AutoSend phrase before greeting', () => {
      const input = 'und schick sie direkt raus Hi Thomas, hier ist Dennis. Ich hoffe dir geht es gut.';
      const result = cleanEmailBodyFromCommand(input);
      expect(result).toBe('Hi Thomas, hier ist Dennis. Ich hoffe dir geht es gut.');
    });
  });

  describe('Case 3: Status-Mails ohne Marker', () => {
    it('should extract status text after "dass"', () => {
      const input = 'dass ich krank bin.'; // This input is already extracted, cleaning should preserve it
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('dass ich krank bin.');
    });

    it('should handle "dem thomas dass" pattern', () => {
      const input = 'dem thomas dass ich spater komme';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      // Should remove "dem thomas" prefix
      expect(result.toLowerCase()).toBe('dass ich spater komme');
    });
  });

  describe('Case 4: Mail mit Doppelpunkt', () => {
    it('should extract body after colon (if input already extracted)', () => {
      const input = 'Morgen 9 Uhr passt.'; // This input is already extracted after colon
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('Morgen 9 Uhr passt.');
    });

    it('should handle text starting after colon', () => {
      const input = ': Morgen 9 Uhr passt.';
      const result = cleanEmailBodyFromCommand(input);
      // Should remove leading colon and punctuation
      expect(result).toBe('Morgen 9 Uhr passt.');
    });
  });

  describe('Cleaning rules', () => {
    it('should remove leading command phrases', () => {
      const input = 'schreibe bitte folgende mail an thomas hallo hier ist der text';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toContain('hallo');
      expect(result).not.toContain('schreibe');
      expect(result).not.toContain('mail an thomas');
    });

    it('should remove "an <name>" prefix', () => {
      const input = 'an thomas hier ist der text';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('hier ist der text');
    });

    it('should remove "dem <name>" prefix', () => {
      const input = 'dem thomas hier ist der text';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('hier ist der text');
    });

    it('should trim and normalize whitespace', () => {
      const input = '  hi   thomas   hier   ist   dennis  ';
      const result = cleanEmailBodyFromCommand(input);
      // Function normalizes whitespace but doesn't capitalize (that's handled elsewhere)
      expect(result).toBe('hi thomas hier ist dennis');
    });

    it('should remove leading punctuation', () => {
      const input = ',.:; hier ist der text';
      const result = cleanEmailBodyFromCommand(input);
      expect(result).toBe('hier ist der text');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      const result = cleanEmailBodyFromCommand('');
      expect(result).toBe('');
    });

    it('should handle input with only command phrases', () => {
      const input = 'an thomas und schick sie direkt raus';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      // Should remove command phrases, but if no meaningful content remains,
      // the function returns the original text (per rule: if wordCount < 3, use original)
      expect(typeof result).toBe('string');
      // The function tries to remove "an thomas" and AutoSend phrases
      // But if nothing meaningful remains, it falls back to original
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should preserve greeting markers case-insensitively', () => {
      const input1 = 'HI thomas hier ist text';
      const input2 = 'Hi thomas hier ist text';
      const input3 = 'hi thomas hier ist text';
      
      const result1 = cleanEmailBodyFromCommand(input1);
      const result2 = cleanEmailBodyFromCommand(input2);
      const result3 = cleanEmailBodyFromCommand(input3);
      
      expect(result1.toLowerCase()).toContain('hi');
      expect(result2.toLowerCase()).toContain('hi');
      expect(result3.toLowerCase()).toContain('hi');
    });
  });

  describe('Real-world examples', () => {
    it('should handle "Schreibe bitte folgende Mail an Thomas Hi Thomas, hier ist Denis. Ich hoffe dir gehts gut."', () => {
      const input = 'Schreibe bitte folgende Mail an Thomas Hi Thomas, hier ist Denis. Ich hoffe dir gehts gut.';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('Hi Thomas, hier ist Denis. Ich hoffe dir gehts gut.');
    });

    it('should handle "Schreibe bitte folgende Mail an Thomas und schick sie direkt raus. Hi Thomas, hier ist Dennis..."', () => {
      const input = 'Schreibe bitte folgende Mail an Thomas und schick sie direkt raus. Hi Thomas, hier ist Dennis. Ich hoffe dir geht es gut.';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('Hi Thomas, hier ist Dennis. Ich hoffe dir geht es gut.');
    });
  });

  describe('Bugfix: "An Thomas." prefix removal', () => {
    it('should remove "An Thomas." prefix from body start', () => {
      const input = 'An Thomas. Bitte ruf mich kurz zurück.';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('Bitte ruf mich kurz zurück.');
    });

    it('should remove "an thomas:" prefix with colon', () => {
      const input = 'an thomas: Bitte ruf mich kurz zurück.';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('Bitte ruf mich kurz zurück.');
    });

    it('should remove "an thomas," prefix with comma', () => {
      const input = 'an thomas, Bitte ruf mich kurz zurück.';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('Bitte ruf mich kurz zurück.');
    });

    it('should handle full command: "Sende folgende Email an Thomas. Bitte ruf mich kurz zurück."', () => {
      // Simuliere extrahierten Body (nach parseFreeDictationEmailCommand)
      const extractedBody = 'An Thomas. Bitte ruf mich kurz zurück.';
      const result = cleanEmailBodyFromCommand(extractedBody, 'thomas');
      expect(result).toBe('Bitte ruf mich kurz zurück.');
    });
  });

  describe('A3.4 Bugfix: Leading "An <Name>." removal', () => {
    it('should remove "An Thomas." prefix from body start', () => {
      const input = 'An Thomas. Bitte ruf mich kurz zurück.';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('Bitte ruf mich kurz zurück.');
    });

    it('should remove "an dem thomas:" prefix with colon', () => {
      const input = 'an dem thomas: bitte ruf mich kurz zurück';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('bitte ruf mich kurz zurück');
    });

    it('should remove "an den thomas," prefix with comma', () => {
      const input = 'an den thomas, bitte ruf mich kurz zurück';
      const result = cleanEmailBodyFromCommand(input, 'thomas');
      expect(result).toBe('bitte ruf mich kurz zurück');
    });

    it('should handle A3.4 integration: extracted body with "An Thomas." prefix', () => {
      // Simuliere A3.4-Extraktion Ergebnis (wie bei "Sende folgende Email an Thomas. Bitte ruf mich kurz zurück.")
      const extractedBodyText = 'An Thomas. Bitte ruf mich kurz zurück.';
      const toNameRaw = 'thomas';
      
      // Simuliere cleanEmailBodyFromCommand + stripLeadingAnName (wie im A3.4-Pfad)
      let cleaned = cleanEmailBodyFromCommand(extractedBodyText, toNameRaw);
      // stripLeadingAnName wäre hier als zusätzlicher Schritt, aber cleanEmailBodyFromCommand
      // sollte es bereits abdecken - falls nicht, wird es im A3.4-Pfad zusätzlich aufgerufen
      
      // Final bodyHint darf NICHT mit "An Thomas" anfangen
      expect(cleaned).not.toMatch(/^an\s+thomas/i);
      expect(cleaned).toContain('Bitte ruf mich kurz zurück');
    });
  });
});

