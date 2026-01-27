/**
 * Unit Tests für ensureTerminalPunctuation (E-Mail-Body endet mit Satzzeichen)
 */

import { describe, it, expect } from 'vitest';
import { ensureTerminalPunctuation } from './email';

describe('ensureTerminalPunctuation', () => {
  it('"Bin beim Kunden" -> "Bin beim Kunden."', () => {
    expect(ensureTerminalPunctuation('Bin beim Kunden')).toBe('Bin beim Kunden.');
  });

  it('"Bin beim Kunden." -> bleibt gleich', () => {
    expect(ensureTerminalPunctuation('Bin beim Kunden.')).toBe('Bin beim Kunden.');
  });

  it('"Bin beim Kunden!" -> bleibt gleich', () => {
    expect(ensureTerminalPunctuation('Bin beim Kunden!')).toBe('Bin beim Kunden!');
  });

  it('"" -> bleibt ""', () => {
    expect(ensureTerminalPunctuation('')).toBe('');
  });

  it('"Hallo Thomas," -> "Hallo Thomas."', () => {
    expect(ensureTerminalPunctuation('Hallo Thomas,')).toBe('Hallo Thomas.');
  });

  it('endet mit ? -> bleibt gleich', () => {
    expect(ensureTerminalPunctuation('Kommt du?')).toBe('Kommt du?');
  });

  it('endet mit … -> bleibt gleich', () => {
    expect(ensureTerminalPunctuation('Ich denke…')).toBe('Ich denke…');
  });

  it('endet mit : -> wird zu .', () => {
    expect(ensureTerminalPunctuation('Folgendes:')).toBe('Folgendes.');
  });

  it('endet mit ; -> wird zu .', () => {
    expect(ensureTerminalPunctuation('Okay;')).toBe('Okay.');
  });

  it('nur Leerzeichen -> ""', () => {
    expect(ensureTerminalPunctuation('   ')).toBe('');
  });
});
