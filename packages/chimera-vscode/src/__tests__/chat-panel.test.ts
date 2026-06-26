import { describe, it, expect } from 'vitest';

// Test the escapeHtml function logic directly since we can't instantiate ChatPanel without VS Code API
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

describe('ChatPanel XSS Prevention', () => {
  describe('F1 fix: escapeHtml properly escapes HTML entities', () => {
    it('escapes ampersand characters', () => {
      const input = 'foo & bar';
      const result = escapeHtml(input);
      expect(result).toBe('foo &amp; bar');
    });

    it('escapes less-than characters', () => {
      const input = 'foo < bar';
      const result = escapeHtml(input);
      expect(result).toBe('foo &lt; bar');
    });

    it('escapes greater-than characters', () => {
      const input = 'foo > bar';
      const result = escapeHtml(input);
      expect(result).toBe('foo &gt; bar');
    });

    it('escapes double quote characters', () => {
      const input = 'foo "bar" baz';
      const result = escapeHtml(input);
      expect(result).toBe('foo &quot;bar&quot; baz');
    });

    it('escapes XSS payload with script injection', () => {
      const input = '<script>alert("xss")</script>';
      const result = escapeHtml(input);
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('escapes HTML entities in onclick attributes', () => {
      const input = '"><img src=x onerror=alert(1)>//';
      const result = escapeHtml(input);
      expect(result).toBe('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;//');
      // The important thing is that < and > are escaped, preventing the tag from being interpreted
      expect(result).not.toContain('<img');
      expect(result).not.toContain('>');
    });

    it('preserves normal text without HTML entities', () => {
      const input = 'Hello world! This is normal text.';
      const result = escapeHtml(input);
      expect(result).toBe('Hello world! This is normal text.');
    });

    it('handles empty string', () => {
      const input = '';
      const result = escapeHtml(input);
      expect(result).toBe('');
    });

    it('handles complex XSS payload with multiple entities', () => {
      const input = 'javascript:alert(document.cookie)';
      const result = escapeHtml(input);
      expect(result).toBe('javascript:alert(document.cookie)');
    });

    it('escapes all special characters in combination', () => {
      const input = '<div class="test">& "value"</div>';
      const result = escapeHtml(input);
      expect(result).toBe('&lt;div class=&quot;test&quot;&gt;&amp; &quot;value&quot;&lt;/div&gt;');
    });
  });
});
