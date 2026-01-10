import { describe, it, expect } from 'vitest';
import {
  textResponse,
  structuredResponse,
  errorResponse,
  createMetadata
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
});