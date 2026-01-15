/**
 * Unit Tests für stripAutoSendFromAppendText Helper-Funktion
 */

import { describe, it, expect } from 'vitest';

// Importiere die Helper-Funktion (wenn exportiert) oder teste über routeVoiceIntent
// Da stripAutoSendFromAppendText nicht exportiert ist, testen wir indirekt über routeVoiceIntent

import { routeVoiceIntent } from './intent_router';

describe('append_autosend_strip', () => {
  describe('stripAutoSendFromAppendText (indirect via routeVoiceIntent)', () => {
    it('should remove "und schick sie direkt los" from appendText', () => {
      const input = 'Ergänze noch Thomas, bitte dann Pizza Salami mitbringen und schick sie direkt los.';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        expect(result.payload.appendText.toLowerCase()).not.toContain('schick');
        expect(result.payload.appendText.toLowerCase()).not.toContain('direkt los');
        expect(result.payload.appendText.toLowerCase()).toContain('thomas');
        expect(result.payload.appendText.toLowerCase()).toContain('pizza salami');
      }
    });

    it('should remove "und schick sie direkt los" from end but keep text', () => {
      const input = 'Thomas, bitte Pizza Salami mitbringen und schick sie direkt los.';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        expect(result.payload.appendText.toLowerCase()).toContain('thomas');
        expect(result.payload.appendText.toLowerCase()).toContain('pizza salami');
        expect(result.payload.appendText.toLowerCase()).not.toMatch(/schick.*direkt.*los/i);
      }
    });

    it('should NOT remove text if no autosend phrase present', () => {
      // Note: This test requires an append trigger, so we add "Ergänze noch" at the beginning
      const input = 'Ergänze noch Thomas, bitte Pizza Salami mitbringen.';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(false);
        expect(result.payload.appendText.toLowerCase()).toContain('thomas');
        expect(result.payload.appendText.toLowerCase()).toContain('pizza salami');
      }
    });

    it('should detect autosend for "und schick sie direkt los" variant', () => {
      const input = 'Füge noch hinzu Thomas, bitte dann Pizza Salami mitbringen und schick sie direkt los.';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        // Text should not contain send phrase
        expect(result.payload.appendText.toLowerCase()).not.toMatch(/schick.*direkt.*los/i);
        expect(result.payload.appendText.toLowerCase()).not.toMatch(/und\s+sch/i);
      }
    });

    it('should remove "und sende es sofort los" from appendText', () => {
      const input = 'Ergänze noch bitte Cola Zero mitbringen und sende es sofort los.';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        expect(result.payload.appendText.toLowerCase()).toContain('bitte cola zero mitbringen');
        // "und sende es sofort los" should be stripped
        expect(result.payload.appendText.toLowerCase()).not.toMatch(/sende.*sofort.*los/i);
        expect(result.payload.appendText.toLowerCase()).not.toMatch(/und\s+sen/i);
      }
    });

    it('should remove "sende es sofort los" (without "und") from appendText', () => {
      const input = 'Ergänze noch bitte Cola Zero mitbringen sende es sofort los.';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        expect(result.payload.appendText.toLowerCase()).toContain('bitte cola zero mitbringen');
        expect(result.payload.appendText.toLowerCase()).not.toMatch(/sende.*sofort.*los/i);
      }
    });
  });
});

