/**
 * Test für Preview-Body-Strip + Punctuation-Cleanup.
 * Prüft, dass nach Entfernen von "nur anzeigen" etc. die Satzzeichen korrekt bereinigt werden.
 */

import { describe, it, expect } from 'vitest';

function previewBodyStripAndCleanup(text: string): string {
  if (!text?.trim()) return text || '';
  let s = text
    .replace(/\b(?:nur|bloß|bloss)\s+(?:zeigen|vorzeigen|anzeigen|darstellen)\b/gi, '')
    .replace(/\bals\s+entwurf\b/gi, '')
    .replace(/\bnur\s+vorbereiten\b/gi, '')
    .replace(/\s*,\s*\./g, '.')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .replace(/,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s;
}

describe('preview-body-strip + punctuation cleanup', () => {
  it('should produce "ruf mich bitte kurz zurück." from "ruf mich bitte kurz zurück, nur anzeigen."', () => {
    const input = 'ruf mich bitte kurz zurück, nur anzeigen.';
    const result = previewBodyStripAndCleanup(input);
    expect(result).toBe('ruf mich bitte kurz zurück.');
  });

  it('should clean ", ." to "."', () => {
    const input = 'Ruf mich bitte kurz zurück, .';
    const result = previewBodyStripAndCleanup(input);
    expect(result).toBe('Ruf mich bitte kurz zurück.');
  });

  it('should remove trailing comma', () => {
    const input = 'Ruf mich bitte kurz zurück,';
    const result = previewBodyStripAndCleanup(input);
    expect(result).toBe('Ruf mich bitte kurz zurück');
  });
});
