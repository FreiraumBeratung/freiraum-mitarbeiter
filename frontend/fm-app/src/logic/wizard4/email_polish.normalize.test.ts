/**
 * Unit Tests für normalizeEmailBodyAfterPolish Funktion
 */

import { describe, it, expect } from 'vitest';
import { normalizeEmailBodyAfterPolish } from './email_polish';

describe('normalizeEmailBodyAfterPolish', () => {
  it('should remove "Zukommen." before greeting', () => {
    const input = 'Zukommen. Hi Thomas, hier ist Dennis. Ich hoffe, dir geht\'s gut.';
    const result = normalizeEmailBodyAfterPolish(input);
    expect(result).toBe('Hi Thomas, hier ist Dennis. Ich hoffe, dir geht\'s gut.');
  });

  it('should remove "Schreiben und sende Sie direkt los." before greeting (regression)', () => {
    const input = 'Schreiben und sende Sie direkt los. Hi Thomas, hier ist Dennis.';
    const result = normalizeEmailBodyAfterPolish(input);
    expect(result).toBe('Hi Thomas, hier ist Dennis.');
  });

  it('should keep text without greeting unchanged', () => {
    const input = 'Bitte Cola Zero mitbringen und sende es sofort los';
    const result = normalizeEmailBodyAfterPolish(input);
    expect(result).toBe(input);
  });

  it('should remove "Zukommen." before greeting (case-insensitive)', () => {
    const input = 'Zukommen. Hi Thomas, hier ist Dennis.';
    const result = normalizeEmailBodyAfterPolish(input);
    expect(result).toBe('Hi Thomas, hier ist Dennis.');
    expect(result).not.toContain('Zukommen');
  });

  it('should handle "lass ... zukommen" case', () => {
    const input = 'Lass Thomas bitte folgende Nachricht zukommen. Hi Thomas, hier ist Dennis, ich hoffe dir geht\'s gut.';
    const result = normalizeEmailBodyAfterPolish(input);
    // Sollte "Hi Thomas..." zurückgeben (prefix mit "zukommen" wird entfernt)
    expect(result).toBe('Hi Thomas, hier ist Dennis, ich hoffe dir geht\'s gut.');
    expect(result).not.toContain('zukommen');
  });

  it('should remove leading punctuation after stripping prefix', () => {
    const input = 'Zukommen. Hi Thomas, hier ist Dennis.';
    const result = normalizeEmailBodyAfterPolish(input);
    expect(result).toBe('Hi Thomas, hier ist Dennis.');
    expect(result).not.toMatch(/^[,.\-–—:;]/);
  });

  it('should handle "zukommen lassen" in prefix', () => {
    const input = 'Lass es bitte zukommen lassen. Hi Thomas, hier ist Dennis.';
    const result = normalizeEmailBodyAfterPolish(input);
    expect(result).toBe('Hi Thomas, hier ist Dennis.');
  });

  it('should keep long prefixes (>160 chars) unchanged', () => {
    const longPrefix = 'Das ist ein sehr langer Text '.repeat(10); // >160 chars
    const input = `${longPrefix} Hi Thomas, hier ist Dennis.`;
    const result = normalizeEmailBodyAfterPolish(input);
    // Sollte unverändert bleiben, da Prefix zu lang ist
    expect(result).toContain('Hi Thomas');
    expect(result.length).toBeGreaterThan(200);
  });

  it('should keep prefix without command words unchanged', () => {
    const input = 'Zur Info: Hi Thomas, hier ist Dennis.';
    const result = normalizeEmailBodyAfterPolish(input);
    // "Zur Info:" enthält keine Command-Wörter, sollte bleiben
    expect(result).toBe(input.trim());
  });
});
