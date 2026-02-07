import { describe, it, expect } from 'vitest';
import { stripSubjectCommand } from './subject_command_strip';

describe('stripSubjectCommand', () => {
  it('should extract subject "Rückruf" and return body "ruf mich bitte kurz zurück."', () => {
    const input = 'Betreff Rückruf, ruf mich bitte kurz zurück.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Rückruf');
    expect(result.text).toBe('ruf mich bitte kurz zurück.');
  });

  it('should extract subject "Pizza" and return body "hey thomas, ..."', () => {
    const input = 'betreff Pizza; hey thomas, ...';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Pizza');
    expect(result.text).toMatch(/hey thomas/i);
  });

  it('should return text unchanged when no subject keyword present', () => {
    const input = 'Hey Thomas, kannst du... ';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBeUndefined();
    expect(result.text).toBe(input);
  });

  it('should return text unchanged when Betreff has no subject ("Betreff , ruf mich an")', () => {
    const input = 'Betreff , ruf mich an';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBeUndefined();
    expect(result.text).toBe(input);
  });

  it('should extract subject from full send command (Helper only, no send-strip)', () => {
    const input = 'Sende an thomas, Betreff Rückruf, ruf mich bitte kurz zurück, schick raus.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Rückruf');
    expect(result.text).toContain('Sende an thomas');
    expect(result.text).toContain('ruf mich bitte kurz zurück');
    expect(result.text).toContain('schick raus');
    expect(result.text).not.toContain('Betreff Rückruf');
  });

  it('should extract subject "Ruckruf" and body "ruf mich bitte kurz zurück." from sanitized bodyHint (intent4.2) with comma', () => {
    const input = 'betreff ruckruf, ruf mich bitte kurz zurück.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Ruckruf');
    expect(result.text).toBe('ruf mich bitte kurz zurück.');
  });

  it('should extract subject "Ruckruf" and body "ruf mich bitte kurz zurück." from form WITHOUT comma', () => {
    const input = 'betreff ruckruf ruf mich bitte kurz zurück.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Ruckruf');
    expect(result.text).toBe('ruf mich bitte kurz zurück.');
  });

  it('should extract subject "Termin" and body "wir müssen kurz sprechen." from form without comma', () => {
    const input = 'betreff termin wir müssen kurz sprechen.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Termin');
    expect(result.text).toBe('wir müssen kurz sprechen.');
  });

  it('should NOT return empty text when body follows subject without comma', () => {
    const input = 'betreff ruckruf ruf mich zuruck.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Ruckruf');
    expect(result.text).toBeTruthy();
    expect(result.text).toBe('ruf mich zuruck.');
  });

  it('explicitSubject "Rückruf" must be preserved for subject resolution (no overwrite by guesser)', () => {
    const input = 'Betreff Rückruf, ruf mich bitte kurz zurück.';
    const { explicitSubject } = stripSubjectCommand(input);
    expect(explicitSubject).toBe('Rückruf');
  });

  it('should extract multiword subject "Angebot Ruckruf" and body "ruf mich bitte kurz zurück."', () => {
    const input = 'betreff angebot ruckruf ruf mich bitte kurz zurück.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject?.toLowerCase()).toContain('angebot');
    expect(result.explicitSubject?.toLowerCase()).toContain('ruckruf');
    expect(result.explicitSubject).toBe('Angebot Ruckruf');
    expect(result.text).toBe('ruf mich bitte kurz zurück.');
  });

  it('should take 1 word when 2nd word is body-start: "betreff angebot kannst du mich zurückrufen"', () => {
    const input = 'betreff angebot kannst du mich zurückrufen.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Angebot');
    expect(result.text).toBe('kannst du mich zurückrufen.');
  });

  it('should extract subject "Rückruf" and body "ruf mich kurz zurück." (single-word subject before body-start)', () => {
    const input = 'betreff rückruf ruf mich kurz zurück.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Rückruf');
    expect(result.text).toBe('ruf mich kurz zurück.');
  });
});
