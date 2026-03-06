/**
 * Formats tool responses according to MCP specification
 */

/**
 * Creates a text response
 * @param {string} text - The text content
 * @param {object} [metadata] - Optional execution metadata
 * @returns {object} MCP-compliant response
 */
export function textResponse(text, metadata = null) {
  const response = {
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
  
  if (metadata) {
    response._meta = metadata;
  }
  
  return response;
}

/**
 * Creates a structured response with both text and structured content
 * @param {object} data - The structured data
 * @param {string} [description] - Optional text description
 * @param {object} [metadata] - Optional execution metadata
 * @returns {object} MCP-compliant response
 */
export function structuredResponse(data, description = null, metadata = null) {
  const response = {
    content: [
      {
        type: 'text',
        text: description || JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
  
  if (metadata) {
    response._meta = metadata;
  }
  
  return response;
}

/**
 * Creates an error response
 * @param {Error|MCPError} error - The error to format
 * @returns {object} MCP-compliant error response
 */
export function errorResponse(error) {
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${error.message}`
      }
    ],
    isError: true
  };
}

/**
 * Creates execution metadata for responses
 * @param {number} startTime - The start time from Date.now()
 * @param {object} [additional] - Additional metadata fields
 * @returns {object} Metadata object
 */
export function createMetadata(startTime, additional = {}) {
  return {
    executionTime: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    ...additional
  };
}

/**
 * Strips verbose context data from search results to reduce token usage
 * Removes context.lines arrays while keeping essential match information
 * @param {object} searchResults - The search results object
 * @returns {object} Search results with context stripped
 */
/**
 * Truncates long match content and highlighted text in search results
 * @param {object} searchResults - The search results object
 * @param {number} maxLength - Maximum content length before truncation
 * @returns {object} Search results with truncated content
 */
export function truncateMatchContent(searchResults, maxLength = 150) {
  if (!searchResults || !searchResults.files) {
    return searchResults;
  }

  const truncate = (str) => {
    if (!str || str.length <= maxLength) return str;
    return str.slice(0, maxLength) + '...';
  };

  return {
    ...searchResults,
    files: searchResults.files.map(file => ({
      ...file,
      matches: file.matches.map(match => {
        const result = { ...match, content: truncate(match.content) };
        if (match.context) {
          result.context = {
            ...match.context,
            highlighted: truncate(match.context.highlighted)
          };
        }
        return result;
      })
    }))
  };
}

/**
 * Compacts search results to only file paths and match counts
 * @param {object} searchResults - The search results object
 * @returns {object} Compact search results
 */
export function compactSearchResults(searchResults) {
  if (!searchResults || !searchResults.files) {
    return searchResults;
  }

  return {
    ...searchResults,
    files: searchResults.files.map(({ path, matchCount }) => ({ path, matchCount }))
  };
}

export function stripSearchContext(searchResults) {
  if (!searchResults || !searchResults.files) {
    return searchResults;
  }

  return {
    ...searchResults,
    files: searchResults.files.map(file => ({
      ...file,
      matches: file.matches.map(match => {
        // Remove context.lines array but keep highlighted snippet
        if (match.context) {
          return {
            line: match.line,
            content: match.content,
            context: {
              highlighted: match.context.highlighted
            }
          };
        }
        return match;
      })
    }))
  };
}