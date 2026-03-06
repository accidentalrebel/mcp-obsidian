import { describe, it, expect } from 'vitest';
import { extractHeadings, formatHeadingsOutline } from '../src/headings.js';

describe('extractHeadings', () => {
  it('should extract headings of all levels', () => {
    const content = '# Title\n\nSome text\n\n## Section\n\n### Sub-section\n\n#### Deep';
    const headings = extractHeadings(content);

    expect(headings).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Section', line: 5 },
      { level: 3, text: 'Sub-section', line: 7 },
      { level: 4, text: 'Deep', line: 9 }
    ]);
  });

  it('should return correct line numbers', () => {
    const content = 'intro\n\n## First\n\ntext\n\n## Second';
    const headings = extractHeadings(content);

    expect(headings[0].line).toBe(3);
    expect(headings[1].line).toBe(7);
  });

  it('should return empty array for empty content', () => {
    expect(extractHeadings('')).toEqual([]);
    expect(extractHeadings(null)).toEqual([]);
    expect(extractHeadings(undefined)).toEqual([]);
  });

  it('should return empty array for content with no headings', () => {
    expect(extractHeadings('just some text\nand more text')).toEqual([]);
  });

  it('should not match lines without space after hashes', () => {
    const content = '#not-a-heading\n## Real Heading';
    const headings = extractHeadings(content);

    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Real Heading');
  });
});

describe('formatHeadingsOutline', () => {
  it('should format headings as outline', () => {
    const headings = [
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Section', line: 5 },
      { level: 3, text: 'Sub', line: 10 }
    ];

    const result = formatHeadingsOutline(headings);

    expect(result).toBe('# Title (line 1)\n## Section (line 5)\n### Sub (line 10)');
  });

  it('should handle empty headings', () => {
    expect(formatHeadingsOutline([])).toBe('');
  });
});
