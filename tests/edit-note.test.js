import { describe, it, expect, beforeEach, vi } from 'vitest';
import { editNote } from '../src/tools.js';

// Mock fs and glob
vi.mock('fs/promises');
vi.mock('glob');

import { readFile, writeFile, access } from 'fs/promises';
import { glob } from 'glob';

describe('editNote', () => {
  const mockVaultPath = '/test/vault';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: file exists at expected path
    access.mockResolvedValue(undefined);
  });

  const sampleNote = [
    '# My Note',
    '',
    '## Section One',
    '- item a',
    '- item b',
    '',
    '## Section Two',
    'Some text here.',
    '',
    '### Subsection',
    '- sub item',
    '',
    '## Section Three',
    'Final content.',
  ].join('\n');

  describe('append-to-section', () => {
    it('should append content before the next heading', async () => {
      readFile.mockResolvedValue(sampleNote);
      writeFile.mockResolvedValue(undefined);

      const context = await editNote(
        mockVaultPath, 'note.md', 'append-to-section',
        '- item c', '## Section One'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      // '- item c' should appear after existing bullets, before the blank line separator
      const idx = lines.indexOf('- item c');
      expect(idx).toBeGreaterThan(-1);
      expect(lines[idx + 1]).toBe('');        // blank line preserved after new item
      expect(lines[idx + 2]).toBe('## Section Two');
      expect(context).toContain('- item c');
    });

    it('should not strand new item after blank line separator (orange spacing)', async () => {
      // Regression: items were being inserted AFTER trailing blanks, so the new
      // bullet ended up separated from the section body by the blank line.
      const note = [
        '## Fruits',
        '- Apple',
        '- Banana',
        '',
        '## Notes',
        'Some text',
      ].join('\n');

      readFile.mockResolvedValue(note);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'append-to-section',
        '- orange', '## Fruits'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      const orangeIdx = lines.indexOf('- orange');
      const bananaIdx = lines.indexOf('- Banana');
      const notesIdx  = lines.indexOf('## Notes');

      // orange must be directly after Banana (no blank line between them)
      expect(orangeIdx).toBe(bananaIdx + 1);
      // blank line between section and next heading is preserved
      expect(lines[orangeIdx + 1]).toBe('');
      expect(lines[orangeIdx + 2]).toBe('## Notes');
      // orange must not end up after the blank line
      expect(orangeIdx).toBeLessThan(notesIdx - 1);
    });
    it('should sort bullets ascending when sort=asc', async () => {
      const note = [
        '## March',
        '- [[2026-03-03]] Wed',
        '- [[2026-03-01]] Mon',
      ].join('\n');

      readFile.mockResolvedValue(note);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'append-to-section',
        '- [[2026-03-02]] Tue', '## March', 'asc'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      const bullets = lines.filter(l => l.startsWith('- '));
      expect(bullets).toEqual([
        '- [[2026-03-01]] Mon',
        '- [[2026-03-02]] Tue',
        '- [[2026-03-03]] Wed',
      ]);
    });

    it('should handle trailing blank lines when sorting', async () => {
      const note = [
        '## Fruits',
        '- Cherry',
        '- Apple',
        '',
        '## Notes',
        'Some text',
      ].join('\n');

      readFile.mockResolvedValue(note);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'append-to-section',
        '- Banana', '## Fruits', 'asc'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      // Bullets should be together, blank line after, then next heading
      const appleIdx = lines.indexOf('- Apple');
      const bananaIdx = lines.indexOf('- Banana');
      const cherryIdx = lines.indexOf('- Cherry');
      const notesIdx = lines.indexOf('## Notes');
      expect(appleIdx).toBeLessThan(bananaIdx);
      expect(bananaIdx).toBeLessThan(cherryIdx);
      expect(cherryIdx).toBeLessThan(notesIdx);
      // Exactly one blank line between last bullet and next heading
      expect(lines[cherryIdx + 1]).toBe('');
      expect(lines[cherryIdx + 2]).toBe('## Notes');
    });

    it('should sort bullets descending when sort=desc', async () => {
      const note = [
        '## Items',
        '- banana',
        '- apple',
      ].join('\n');

      readFile.mockResolvedValue(note);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'append-to-section',
        '- cherry', '## Items', 'desc'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      const bullets = lines.filter(l => l.startsWith('- '));
      expect(bullets).toEqual([
        '- cherry',
        '- banana',
        '- apple',
      ]);
    });
  });

  describe('prepend-to-section', () => {
    it('should insert content immediately after the heading line', async () => {
      readFile.mockResolvedValue(sampleNote);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'prepend-to-section',
        'New first line', '## Section Two'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      const headingIdx = lines.indexOf('## Section Two');
      expect(lines[headingIdx + 1]).toBe('New first line');
    });
  });

  describe('insert-before-section', () => {
    it('should insert content before the heading line', async () => {
      readFile.mockResolvedValue(sampleNote);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'insert-before-section',
        '---', '## Section Two'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      const dashIdx = lines.indexOf('---');
      expect(lines[dashIdx + 1]).toBe('## Section Two');
    });
  });

  describe('append-to-file', () => {
    it('should append content at end of file', async () => {
      readFile.mockResolvedValue(sampleNote);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'append-to-file',
        '## New Section'
      );

      const written = writeFile.mock.calls[0][1];
      expect(written.endsWith('## New Section')).toBe(true);
    });

    it('should not require heading parameter', async () => {
      readFile.mockResolvedValue('# Note\nContent');
      writeFile.mockResolvedValue(undefined);

      // Should not throw
      await editNote(
        mockVaultPath, 'note.md', 'append-to-file',
        'Appended text'
      );

      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw when heading is not found', async () => {
      readFile.mockResolvedValue(sampleNote);

      await expect(
        editNote(mockVaultPath, 'note.md', 'append-to-section', 'content', '## Nonexistent')
      ).rejects.toThrow('Heading not found');
    });

    it('should throw when heading is missing for section operations', async () => {
      readFile.mockResolvedValue(sampleNote);

      await expect(
        editNote(mockVaultPath, 'note.md', 'prepend-to-section', 'content')
      ).rejects.toThrow('heading is required');
    });
  });

  describe('section boundary detection', () => {
    it('should detect subsection boundaries correctly', async () => {
      // ### Subsection ends at ## Section Three (higher level)
      readFile.mockResolvedValue(sampleNote);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'append-to-section',
        '- new sub item', '### Subsection'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      const newItemIdx = lines.indexOf('- new sub item');
      // Should be before ## Section Three
      const sectionThreeIdx = lines.indexOf('## Section Three');
      expect(newItemIdx).toBeLessThan(sectionThreeIdx);
      // Should be after '- sub item'
      const subItemIdx = lines.indexOf('- sub item');
      expect(newItemIdx).toBeGreaterThan(subItemIdx);
    });

    it('should handle section at end of file', async () => {
      readFile.mockResolvedValue(sampleNote);
      writeFile.mockResolvedValue(undefined);

      await editNote(
        mockVaultPath, 'note.md', 'append-to-section',
        '- added', '## Section Three'
      );

      const written = writeFile.mock.calls[0][1];
      const lines = written.split('\n');
      const addedIdx = lines.indexOf('- added');
      // Last section — appended at end
      expect(addedIdx).toBe(lines.length - 1);
    });
  });

  describe('context output', () => {
    it('should return surrounding lines around the insertion point', async () => {
      readFile.mockResolvedValue(sampleNote);
      writeFile.mockResolvedValue(undefined);

      const context = await editNote(
        mockVaultPath, 'note.md', 'append-to-section',
        '- item c', '## Section One'
      );

      // Should contain the inserted line and some surrounding context
      expect(context).toContain('- item c');
      // Should contain ellipsis markers if not at file boundaries
      expect(context).toContain('...');
    });
  });
});
