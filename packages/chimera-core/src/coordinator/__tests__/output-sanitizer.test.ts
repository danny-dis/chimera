import { describe, it, expect } from 'vitest';
import { sanitizeWriterOutput, sanitizeReviewerOutput } from '../output-sanitizer.js';

describe('sanitizeWriterOutput', () => {
  it('extracts response from JSON object', () => {
    const input = JSON.stringify({ response: 'Hello world', thought: 'internal reasoning' });
    expect(sanitizeWriterOutput(input)).toBe('Hello world');
  });

  it('returns plain text passthrough', () => {
    expect(sanitizeWriterOutput('Just a plain answer')).toBe('Just a plain answer');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeWriterOutput('')).toBe('');
    expect(sanitizeWriterOutput('   ')).toBe('');
  });

  it('strips scaffolding and extracts content', () => {
    const input = `"thought": "reasoning here"
"response": "The answer"
"confidence": 0.9`;
    expect(sanitizeWriterOutput(input)).toBe('The answer');
  });
});

describe('sanitizeReviewerOutput', () => {
  it('extracts clean summary from JSON with findings', () => {
    const input = JSON.stringify({
      thought: 'Detailed internal reasoning...',
      verdict: 'FAIL',
      confidence: 0.95,
      findings: [
        { description: 'Missing error handling', severity: 'high', evidence: 'line 42' },
        { description: 'Unused variable', severity: 'low', evidence: 'line 10' },
      ],
    });
    const result = sanitizeReviewerOutput(input);
    expect(result).toContain('Review findings:');
    expect(result).toContain('[HIGH] Missing error handling');
    expect(result).toContain('[LOW] Unused variable');
    expect(result).not.toContain('thought');
    expect(result).not.toContain('Detailed internal reasoning');
  });

  it('handles PASS verdict with no findings', () => {
    const input = JSON.stringify({
      thought: 'Everything looks good',
      verdict: 'PASS',
      confidence: 1.0,
      findings: [],
    });
    const result = sanitizeReviewerOutput(input);
    expect(result).toBe('');
  });

  it('returns raw text if not valid JSON', () => {
    const input = 'Just some text';
    expect(sanitizeReviewerOutput(input)).toBe('Just some text');
  });

  it('extracts verdict via regex fallback', () => {
    const input = '"verdict": "NEEDS_REVISION" some other text';
    expect(sanitizeReviewerOutput(input)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeReviewerOutput('')).toBe('');
  });
});
