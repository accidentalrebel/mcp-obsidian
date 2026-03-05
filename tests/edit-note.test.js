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
      // '- item c' should appear right before '## Section Two'
      const idx = lines.indexOf('- item c');
      expect(idx).toBeGreaterThan(-1);
      expect(lines[idx + 1]).toBe('## Section Two');
      expect(context).toContain('- item c');
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
