/**
 * Extract all headings from markdown content.
 * @param {string} content - Markdown content
 * @returns {Array<{level: number, text: string, line: number}>} Headings with metadata
 */
export function extractHeadings(content) {
  if (!content) return [];
  const lines = content.split('\n');
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim(), line: i + 1 });
    }
  }
  return headings;
}

/**
 * Format headings into a readable outline string.
 * @param {Array<{level: number, text: string, line: number}>} headings
 * @returns {string} Formatted outline
 */
export function formatHeadingsOutline(headings) {
  return headings
    .map(h => `${'#'.repeat(h.level)} ${h.text} (line ${h.line})`)
    .join('\n');
}
