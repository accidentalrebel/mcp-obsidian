import { describe, it, expect } from 'vitest';
import {
  textResponse,
  structuredResponse,
  errorResponse,
  createMetadata,
  truncateMatchContent,
  compactSearchResults
} from '../src/response-formatter.js';

describe('Response Formatter', () => {
  describe('textResponse', () => {
    it('should create a text response', () => {
      const response = textResponse('Hello, world!');
      
      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Hello, world!'
          }
        ]
      });
    });

    it('should include metadata when provided', () => {
      const metadata = { executionTime: 100, tool: 'test' };
      const response = textResponse('Hello', metadata);
      
      expect(response._meta).toEqual(metadata);
    });
  });

  describe('structuredResponse', () => {
    it('should create structured response with description', () => {
      const data = { count: 5, items: ['a', 'b', 'c'] };
      const response = structuredResponse(data, 'Found 5 items');
      
      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Found 5 items'
          }
        ],
        structuredContent: data
      });
    });

    it('should create structured response without description', () => {
      const data = { key: 'value' };
      const response = structuredResponse(data);
      
      expect(response.content[0].text).toBe(JSON.stringify(data, null, 2));
      expect(response.structuredContent).toEqual(data);
    });

    it('should include metadata when provided', () => {
      const data = { key: 'value' };
      const metadata = { executionTime: 50, filesSearched: 10 };
      const response = structuredResponse(data, null, metadata);
      
      expect(response._meta).toEqual(metadata);
    });
  });

  describe('errorResponse', () => {
    it('should create error response from Error', () => {
      const error = new Error('Something went wrong');
      const response = errorResponse(error);
      
      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Error: Something went wrong'
          }
        ],
        isError: true
      });
    });
  });

  describe('createMetadata', () => {
    it('should create metadata with execution time', () => {
      const startTime = Date.now() - 100; // 100ms ago
      const metadata = createMetadata(startTime);
      
      expect(metadata.executionTime).toBeGreaterThanOrEqual(100);
      expect(metadata.executionTime).toBeLessThan(200); // Should not take more than 100ms extra
      expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include additional fields', () => {
      const startTime = Date.now();
      const additional = { tool: 'test-tool', filesSearched: 42 };
      const metadata = createMetadata(startTime, additional);

      expect(metadata.tool).toBe('test-tool');
      expect(metadata.filesSearched).toBe(42);
      expect(metadata).toHaveProperty('executionTime');
      expect(metadata).toHaveProperty('timestamp');
    });
  });

  describe('truncateMatchContent', () => {
    it('should truncate long content', () => {
      const input = {
        files: [{
          path: 'note.md',
          matchCount: 1,
          matches: [{
            line: 1,
            content: 'A'.repeat(200),
            context: { highlighted: 'B'.repeat(200) }
          }]
        }]
      };

      const result = truncateMatchContent(input, 150);

      expect(result.files[0].matches[0].content).toBe('A'.repeat(150) + '...');
      expect(result.files[0].matches[0].context.highlighted).toBe('B'.repeat(150) + '...');
    });

    it('should leave short content unchanged', () => {
      const input = {
        files: [{
          path: 'note.md',
          matchCount: 1,
          matches: [{ line: 1, content: 'short' }]
        }]
      };

      const result = truncateMatchContent(input, 150);

      expect(result.files[0].matches[0].content).toBe('short');
    });

    it('should handle null/empty input', () => {
      expect(truncateMatchContent(null)).toBeNull();
      expect(truncateMatchContent({})).toEqual({});
      expect(truncateMatchContent({ files: [] })).toEqual({ files: [] });
    });

    it('should handle matches without context', () => {
      const input = {
        files: [{
          path: 'note.md',
          matchCount: 1,
          matches: [{ line: 1, content: 'X'.repeat(200) }]
        }]
      };

      const result = truncateMatchContent(input, 50);

      expect(result.files[0].matches[0].content).toBe('X'.repeat(50) + '...');
      expect(result.files[0].matches[0].context).toBeUndefined();
    });
  });

  describe('compactSearchResults', () => {
    it('should return only paths and match counts', () => {
      const input = {
        files: [{
          path: 'note.md',
          matchCount: 3,
          matches: [
            { line: 1, content: 'some content' },
            { line: 5, content: 'more content' },
            { line: 10, content: 'even more' }
          ]
        }],
        totalMatches: 3,
        fileCount: 1
      };

      const result = compactSearchResults(input);

      expect(result.files).toEqual([{ path: 'note.md', matchCount: 3 }]);
      expect(result.totalMatches).toBe(3);
      expect(result.fileCount).toBe(1);
    });

    it('should handle null/empty input', () => {
      expect(compactSearchResults(null)).toBeNull();
      expect(compactSearchResults({})).toEqual({});
    });
  });
});