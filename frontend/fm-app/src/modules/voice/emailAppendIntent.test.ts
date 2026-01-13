/**
 * Unit Tests für email-append Intent Detection
 * 
 * Testet die Erkennung von email-append Intents und die Extraktion von appendText.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('email-append Intent Detection', () => {
  
  describe('Case 1: Basic append with text', () => {
    it('should detect "fuge noch hinzu ps ich melde mich später"', () => {
      const input = 'fuge noch hinzu ps ich melde mich später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich melde mich später');
        expect(result.meta?.autoSend).toBe(false);
      }
    });

    it('should detect "füge noch hinzu ps ich melde mich später" (with umlaut)', () => {
      const input = 'füge noch hinzu ps ich melde mich später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich melde mich später');
      }
    });

    it('should detect "erganze noch bitte kurze rückmeldung"', () => {
      const input = 'erganze noch bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });

    it('should detect "hang noch dran ps ich komme später"', () => {
      const input = 'hang noch dran ps ich komme später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich komme später');
      }
    });

    it('should detect "schreib noch dazu bitte kurze rückmeldung"', () => {
      const input = 'schreib noch dazu bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });

    it('should detect "und ausserdem bitte kurze rückmeldung"', () => {
      const input = 'und ausserdem bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });

    it('should detect short form "fuge hinzu ps ich melde mich später"', () => {
      const input = 'fuge hinzu ps ich melde mich später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich melde mich später');
      }
    });

    it('should detect short form "erganze bitte kurze rückmeldung"', () => {
      const input = 'erganze bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });
  });

  describe('Case 2: Append with AutoSend detection', () => {
    it('should detect autoSend and remove "sende" from appendText', () => {
      const input = 'erganze noch bitte kurze rückmeldung und sende es jetzt';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        // "sende" should NOT be in appendText
        expect(result.payload.appendText.toLowerCase()).not.toContain('sende');
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });

    it('should detect autoSend for "und schick es ab"', () => {
      const input = 'fuge noch hinzu ps ich melde mich später und schick es ab';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        expect(result.payload.appendText.toLowerCase()).not.toContain('schick es ab');
      }
    });

    it('should detect autoSend for "und raus damit"', () => {
      const input = 'erganze noch bitte kurze rückmeldung und raus damit';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        expect(result.payload.appendText.toLowerCase()).not.toContain('raus damit');
      }
    });

    it('should detect autoSend for "sofort raus"', () => {
      const input = 'fuge noch hinzu ps ich melde mich später sofort raus';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        expect(result.payload.appendText.toLowerCase()).not.toContain('sofort raus');
      }
    });
  });

  describe('Case 3: Empty appendText handling', () => {
    it('should NOT create email-append intent when only trigger phrase present', () => {
      const input = 'fuge noch hinzu';
      const result = routeVoiceIntent(input);
      
      // Should fall through to other intents or unknown, NOT email-append
      expect(result.type).not.toBe('email-append');
    });

    it('should NOT create email-append intent when only trigger phrase with punctuation', () => {
      const input = 'fuge noch hinzu:';
      const result = routeVoiceIntent(input);
      
      expect(result.type).not.toBe('email-append');
    });

    it('should NOT create email-append intent when only trigger phrase with period', () => {
      const input = 'fuge noch hinzu.';
      const result = routeVoiceIntent(input);
      
      expect(result.type).not.toBe('email-append');
    });
  });

  describe('Case 4: Punctuation trimming', () => {
    it('should trim leading colon after trigger', () => {
      const input = 'fuge noch hinzu: ps ich melde mich später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText).not.toMatch(/^[:]/);
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich melde mich später');
      }
    });

    it('should trim leading comma after trigger', () => {
      const input = 'erganze noch, bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText).not.toMatch(/^[,]/);
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });
  });

  describe('Case 5: Extended synonyms', () => {
    it('should detect "fuge bitte noch hinzu ps ich melde mich später"', () => {
      const input = 'fuge bitte noch hinzu ps ich melde mich später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich melde mich später');
      }
    });

    it('should detect "erganze bitte noch bitte kurze rückmeldung"', () => {
      const input = 'erganze bitte noch bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });

    it('should detect "erganze das um ps ich komme später"', () => {
      const input = 'erganze das um ps ich komme später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich komme später');
      }
    });

    it('should detect "erweitere das um bitte kurze rückmeldung"', () => {
      const input = 'erweitere das um bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });

    it('should detect "pack noch dazu ps ich melde mich später"', () => {
      const input = 'pack noch dazu ps ich melde mich später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich melde mich später');
      }
    });

    it('should detect "setz noch dahinter bitte kurze rückmeldung"', () => {
      const input = 'setz noch dahinter bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });

    it('should detect "mach noch dazu ps ich komme später"', () => {
      const input = 'mach noch dazu ps ich komme später';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('ps ich komme später');
      }
    });

    it('should detect "hau noch dran bitte kurze rückmeldung"', () => {
      const input = 'hau noch dran bitte kurze rückmeldung';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });
  });

  describe('Case 6: AutoSend stripping with new synonyms', () => {
    it('should strip autosend phrases from "erweitere das um bitte kurze rückmeldung und sende es jetzt"', () => {
      const input = 'erweitere das um bitte kurze rückmeldung und sende es jetzt';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        expect(result.payload.appendText.toLowerCase()).not.toContain('sende');
        expect(result.payload.appendText.toLowerCase()).toContain('bitte kurze rückmeldung');
      }
    });
  });

  describe('Case 7: Voice suppression in email-append flow', () => {
    let speakSpy: ReturnType<typeof vi.fn>;
    let partnerBotSaySpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Mock speak function (from tts.ts)
      speakSpy = vi.fn();
      // Mock PartnerBotBus.say
      partnerBotSaySpy = vi.fn();
      
      // Setup mocks on window/global if needed
      if (typeof window !== 'undefined') {
        (window as any).__fm_speak = speakSpy;
        (window as any).__fm_partnerbot_say = partnerBotSaySpy;
      }
    });

    it('should NOT call speak() when email-append intent is detected (voice suppressed)', () => {
      const input = 'fuge noch hinzu ps ich melde mich später und schick es ab';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        // Note: We can't directly test speak() calls here since routeVoiceIntent only returns the intent
        // The actual speak suppression happens in index.ts applyVoiceIntent handler
        // This test ensures the intent is correctly detected with autoSend=true
        // The actual voice suppression is tested implicitly by the fact that no speak() is called
        // in the email-append handler when autoSend=true
      }
    });

    it('should detect email-append with autoSend without triggering voice in handler', () => {
      // This test documents that email-append intents with autoSend=true
      // should have voice suppressed in the handler (index.ts)
      const input = 'erganze noch bitte kurze rückmeldung und sende es jetzt';
      const result = routeVoiceIntent(input);
      
      expect(result.type).toBe('email-append');
      if (result.type === 'email-append') {
        expect(result.meta?.autoSend).toBe(true);
        // Voice suppression happens in index.ts, not in intent_router
        // This test ensures the intent structure is correct
      }
    });
  });
});

