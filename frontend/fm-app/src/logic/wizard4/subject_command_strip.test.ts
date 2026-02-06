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

  it('should extract subject "Ruckruf" and body "ruf mich bitte kurz zurück." from sanitized bodyHint (intent4.2)', () => {
    // Mit Komma als Trenner (Intent-Router liefert ggf. "betreff ruckruf, ruf mich...")
    const input = 'betreff ruckruf, ruf mich bitte kurz zurück.';
    const result = stripSubjectCommand(input);
    expect(result.explicitSubject).toBe('Ruckruf');
    expect(result.text).toBe('ruf mich bitte kurz zurück.');
  });
});
