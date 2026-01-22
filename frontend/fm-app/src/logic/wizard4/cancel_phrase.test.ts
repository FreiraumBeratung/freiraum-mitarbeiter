/**
 * Unit Tests für Cancel-Phrase Detection: Cancel-Phrasen erkennen und Body bereinigen
 * 
 * Testet die Erkennung von Cancel-Phrasen und das Entfernen aus dem Body.
 */

import { describe, it, expect } from 'vitest';
import { hasCancelPhrase, stripCancelPhraseFromBody } from './cancel_phrase';

describe('hasCancelPhrase', () => {
  describe('Trailing "doch nicht" / "lieber nicht" detection (from raw)', () => {
    it('should match "Schick Thomas, ich bin gleich da. Doch nicht." (trailing "doch nicht" from raw)', () => {
      const raw = "Schick Thomas, ich bin gleich da. Doch nicht.";
      const normalized = "schick thomas ich bin gleich da nicht";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(true);
    });

    it('should match "Sende an Thomas hi. Lieber nicht." (trailing "lieber nicht" from raw)', () => {
      const raw = "Sende an Thomas hi. Lieber nicht.";
      const normalized = "sende an thomas hi lieber nicht";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(true);
    });

    it('should return false for "Das stimmt nicht." (nicht nicht am Ende als Cancel)', () => {
      const raw = "Das stimmt nicht.";
      const normalized = "das stimmt nicht";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(false);
    });
  });

  describe('Trailing colloquial cancel phrases (from raw)', () => {
    it('should match "Schick Thomas: Ich bin gleich da. Ach nein." (trailing "ach nein" from raw)', () => {
      const raw = "Schick Thomas: Ich bin gleich da. Ach nein.";
      const normalized = "schick thomas ich bin gleich da ach nein";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(true);
    });

    it('should match "Sende Thomas: Hi. Nee." (trailing "nee" from raw)', () => {
      const raw = "Sende Thomas: Hi. Nee.";
      const normalized = "sende thomas hi nee";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(true);
    });

    it('should match "Schick Thomas: Ich komme später. Besser doch nicht." (trailing "besser doch nicht" from raw)', () => {
      const raw = "Schick Thomas: Ich komme später. Besser doch nicht.";
      const normalized = "schick thomas ich komme spater besser doch nicht";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(true);
    });

    it('should return false for "Sende Thomas: Das ist nicht gut." (nein/nicht nicht am Ende als Cancel)', () => {
      const raw = "Sende Thomas: Das ist nicht gut.";
      const normalized = "sende thomas das ist nicht gut";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(false);
    });

    it('should return false for "Nein, das ist so." (nein nicht am Ende als Cancel)', () => {
      const raw = "Nein, das ist so.";
      const normalized = "nein das ist so";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(false);
    });
  });

  describe('Normalized cancel phrases', () => {
    it('should match "schick sie doch nicht raus" (from normalized)', () => {
      const raw = "Schick sie doch nicht raus";
      const normalized = "schick sie doch nicht raus";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(true);
    });

    it('should match "sende thomas nicht senden" (from normalized)', () => {
      const raw = "Sende Thomas nicht senden";
      const normalized = "sende thomas nicht senden";
      const result = hasCancelPhrase({ raw, normalized });
      
      expect(result).toBe(true);
    });
  });
});

describe('stripCancelPhraseFromBody', () => {
    it('should remove "Doch nicht." from end', () => {
      const input = "Ich bin gleich da. Doch nicht.";
      const result = stripCancelPhraseFromBody(input);
      
      // Punkt vor "Doch nicht." bleibt erhalten
      expect(result).toBe('Ich bin gleich da');
    });

    it('should remove "Lieber nicht" from end', () => {
      const input = "Ich bin gleich da. Lieber nicht";
      const result = stripCancelPhraseFromBody(input);
      
      // Punkt vor "Lieber nicht" bleibt erhalten
      expect(result).toBe('Ich bin gleich da');
    });

    it('should remove ", doch nicht" from end', () => {
      const input = "Ich bin gleich da, doch nicht";
      const result = stripCancelPhraseFromBody(input);
      
      // Komma wird auch entfernt wenn "doch nicht" entfernt wird
      expect(result).toBe('Ich bin gleich da');
    });

    it('should remove "Schick sie nicht raus." from end', () => {
      const input = "Ich bin gleich da. Schick sie nicht raus.";
      const result = stripCancelPhraseFromBody(input);
      
      // Punkt vor "Schick" bleibt erhalten
      expect(result).toBe('Ich bin gleich da');
    });

    it('should remove "Doch nicht." from end', () => {
      const input = "Ich bin gleich da. Doch nicht.";
      const result = stripCancelPhraseFromBody(input);
      
      // Punkt vor "Doch" bleibt erhalten
      expect(result).toBe('Ich bin gleich da');
    });

    it('should NOT remove "nicht" from middle of text', () => {
      const input = "Ich bin nicht sicher ob das stimmt.";
      const result = stripCancelPhraseFromBody(input);
      
      // "nicht" ist nicht am Ende, sollte nicht entfernt werden
      expect(result).toContain('nicht');
      expect(result).toBe(input); // Unverändert
    });

    it('should return original if body would be empty after cleaning', () => {
      const input = "Nicht.";
      const result = stripCancelPhraseFromBody(input);
      
      // Safety: Wenn Body nach Bereinigung leer wäre, gib ursprünglichen Body zurück
      // "Nicht." wird zu "" -> gib "Nicht." zurück
      expect(result).toBe(input);
    });

    it('should remove "Ach nein." from end', () => {
      const input = "Ich bin gleich da. Ach nein.";
      const result = stripCancelPhraseFromBody(input);
      
      expect(result).toBe('Ich bin gleich da');
    });

    it('should remove "Besser doch nicht." from end', () => {
      const input = "Ich bin gleich da. Besser doch nicht.";
      const result = stripCancelPhraseFromBody(input);
      
      expect(result).toBe('Ich bin gleich da');
    });

    it('should remove "Nee." from end', () => {
      const input = "Ich bin gleich da. Nee.";
      const result = stripCancelPhraseFromBody(input);
      
      expect(result).toBe('Ich bin gleich da');
    });

    it('should remove "Nein." from end', () => {
      const input = "Ich bin gleich da. Nein.";
      const result = stripCancelPhraseFromBody(input);
      
      expect(result).toBe('Ich bin gleich da');
    });
});
