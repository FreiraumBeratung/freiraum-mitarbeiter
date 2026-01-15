/**
 * Unit Tests für "Schicken-Direct" Intent-Erkennung
 * 
 * Testet das Pattern: "<Name> schicken/senden <Body>"
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Intent Router: "Schicken-Direct" Pattern', () => {
  it('should recognize "Bitte Thomas schicken, ich komme 10 minuten später" (TEST A)', () => {
    const input = 'Bitte Thomas schicken, ich komme 10 minuten später.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toContain('ich komme 10 minuten');
      expect(result.meta?.autoSend).toBe(true);
      // Should NOT fall into ai-chat
      expect(result.type).not.toBe('ai-chat');
    }
  });

  it('should recognize "Bitte Thomas schicken. Hi Thomas, ich komme 10 minuten später" (TEST B)', () => {
    const input = 'Bitte Thomas schicken. Hi Thomas, ich komme 10 minuten später.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toMatch(/^hi\s+thomas/);
      expect(result.bodyHint?.toLowerCase()).toContain('ich komme 10 minuten');
      expect(result.meta?.autoSend).toBe(true);
      // Should NOT fall into ai-chat
      expect(result.type).not.toBe('ai-chat');
    }
  });

  it('should recognize "Thomas senden hi thomas ich komme spater" (without "bitte")', () => {
    const input = 'Thomas senden hi thomas ich komme spater';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toMatch(/^hi\s+thomas/);
      expect(result.meta?.autoSend).toBe(true);
    }
  });

  it('should set autoSend=true for all schicken-direct patterns', () => {
    const input = 'Thomas schicken ich bin krank';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.meta?.autoSend).toBe(true);
    }
  });

  it('should NOT match patterns that should be handled by other intents', () => {
    // "folgende nachricht ... schicken" should be handled by schicken-form pattern (earlier)
    const input = 'folgende nachricht Thomas schicken Hi Thomas';
    const result = routeVoiceIntent(input);
    
    // Should be email-compose but might be matched by schicken-form pattern (which is fine)
    // Just check it's not ai-chat
    expect(result.type).not.toBe('ai-chat');
  });
});
