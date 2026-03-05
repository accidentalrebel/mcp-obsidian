import { readFile, writeFile, mkdir, unlink, access, stat } from 'fs/promises';
import { constants } from 'fs';
import { glob } from 'glob';
import path from 'path';
import { Errors, MCPError } from './errors.js';
import { config } from './config.js';

// Import pure functions
import { findMatchesInContent, findMatchesWithOperators, transformSearchResults, paginateSearchResults, paginateArray } from './search.js';
import { extractTags as extractTagsPure, hasAllTags } from './tags.js';
import { extractH1Title, titleMatchesQuery, transformTitleResults } from './title-search.js';
import { extractNoteMetadata, transformBatchMetadata } from './metadata.js';
import { extractWikilinks, isMoc } from './links.js';
import { 
  validatePathWithinBase, 
  validateMarkdownExtension, 
  validateRequiredParameters,
  validateFileSize as validateFileSizePure,
  sanitizeContent as sanitizeContentPure
} from './validation.js';

/**
 * Wrapper to convert validation results to exceptions
 */
function assertValid(validationResult, errorFactory) {
  if (!validationResult.valid) {
    throw errorFactory(validationResult.error, validationResult);
  }
  return validationResult;
}

/**
 * Search for content in vault (I/O function using pure functions)
 */
export async function searchVault(vaultPath, query, searchPath, caseSensitive = false, contextOptions = {}, limit = 100, offset = 0) {
  // Validate using pure function
  const paramValidation = validateRequiredParameters({ query }, ['query']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));

  // Validate search path if provided
  if (searchPath) {
    const pathValidation = validatePathWithinBase(vaultPath, searchPath);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: searchPath }));
  }

  // I/O: Get files
  const searchPattern = searchPath
    ? path.join(vaultPath, searchPath, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  const files = await glob(searchPattern);

  // Sort files for consistent pagination across requests
  files.sort();

  // Process files with pure functions
  const fileMatches = [];
  const totalFiles = files.length;

  for (const file of files) {
    try {
      // I/O: Check file size
      const stats = await stat(file);
      const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);

      if (!sizeValidation.valid) {
        continue; // Skip large files
      }

      // I/O: Read file
      const content = await readFile(file, 'utf-8');

      // Check if query contains operators
      const hasOperators = /\b(AND|OR|NOT)\b|[:\-()]|"/.test(query);

      let matches;
      if (hasOperators) {
        // Extract metadata for operator-based search
        const titleData = extractH1Title(content);
        const tags = extractTagsPure(content);
        const metadata = {
          title: titleData ? titleData.title : '',
          tags
        };

        // Use operator-based search
        matches = findMatchesWithOperators(content, query, metadata, caseSensitive, contextOptions);
      } else {
        // Use simple string matching for backward compatibility
        matches = findMatchesInContent(content, query, caseSensitive, contextOptions);
      }

      if (matches.length > 0) {
        fileMatches.push({ file, matches });
      }
    } catch (error) {
      // Skip files with read errors
      continue;
    }
  }

  // Pure: Transform and paginate results
  const results = transformSearchResults(fileMatches, vaultPath);
  return paginateSearchResults(results, limit, offset);
}

/**
 * Search for notes by title (I/O function using pure functions)
 */
export async function searchByTitle(vaultPath, query, searchPath, caseSensitive = false, limit = 100, offset = 0) {
  // Validate using pure function
  const paramValidation = validateRequiredParameters({ query }, ['query']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));

  // Check for empty query
  if (!query || query.trim() === '') {
    throw Errors.invalidParams('query cannot be empty');
  }

  // Validate search path if provided
  if (searchPath) {
    const pathValidation = validatePathWithinBase(vaultPath, searchPath);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: searchPath }));
  }

  // I/O: Get files
  const searchPattern = searchPath
    ? path.join(vaultPath, searchPath, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  const files = await glob(searchPattern);

  // Sort files for consistent pagination across requests
  files.sort();

  // Process files with pure functions
  const fileTitleMatches = [];

  for (const file of files) {
    try {
      // I/O: Check file size
      const stats = await stat(file);
      const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);

      if (!sizeValidation.valid) {
        continue; // Skip large files
      }

      // I/O: Read file
      const content = await readFile(file, 'utf-8');

      // Pure: Extract title
      const titleInfo = extractH1Title(content);

      if (titleInfo && titleMatchesQuery(titleInfo.title, query, caseSensitive)) {
        fileTitleMatches.push({ file, titleInfo });
      }
    } catch (error) {
      // Skip files with read errors
      continue;
    }
  }

  // Pure: Transform and paginate results
  const transformedResults = transformTitleResults(fileTitleMatches, vaultPath);
  const { items: paginatedResults, pagination } = paginateArray(transformedResults.results, limit, offset);

  return {
    results: paginatedResults,
    count: paginatedResults.length,
    filesSearched: files.length,
    pagination
  };
}

/**
 * List notes in vault (I/O function)
 */
export async function listNotes(vaultPath, directory, limit = 100, offset = 0) {
  // Validate directory path if provided
  if (directory) {
    const pathValidation = validatePathWithinBase(vaultPath, directory);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: directory }));
  }

  const searchPath = directory
    ? path.join(vaultPath, directory, '**/*.md')
    : path.join(vaultPath, '**/*.md');

  const files = await glob(searchPath);
  const allNotes = files.map(file => path.relative(vaultPath, file)).sort();

  // Apply pagination
  const { items: paginatedNotes, pagination } = paginateArray(allNotes, limit, offset);

  return {
    notes: paginatedNotes,
    count: paginatedNotes.length,
    pagination
  };
}

async function resolveNotePath(vaultPath, notePath) {
  const pathValidation = validatePathWithinBase(vaultPath, notePath);
  assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: notePath }));

  const fullPath = pathValidation.resolvedPath;

  try {
    await access(fullPath, constants.R_OK);
    return fullPath;
  } catch {
    // Fallback: search by filename
  }

  const basename = path.basename(notePath);
  const searchPattern = path.join(vaultPath, '**', basename);
  const matches = await glob(searchPattern);

  if (matches.length === 0) {
    throw Errors.resourceNotFound(notePath, { path: notePath });
  }

  if (matches.length === 1) {
    return matches[0];
  }

  // Multiple matches - report ambiguity
  const relativePaths = matches.map(m => path.relative(vaultPath, m)).join(', ');
  throw Errors.invalidParams(
    `Ambiguous path "${notePath}" matches multiple notes: ${relativePaths}. Please specify the full path.`,
    { path: notePath, matches: relativePaths }
  );
}

/**
 * Read note content (I/O function with validation)
 */
export async function readNote(vaultPath, notePath) {
  // Pure validations
  const paramValidation = validateRequiredParameters({ path: notePath }, ['path']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));

  const extensionValidation = validateMarkdownExtension(notePath);
  assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));

  // Resolve path with wikilink-style fallback
  const fullPath = await resolveNotePath(vaultPath, notePath);

  // I/O: Check file size
  try {
    const stats = await stat(fullPath);
    const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);
    assertValid(sizeValidation, (msg, data) =>
      Errors.invalidParams(msg, { path: notePath, ...data })
    );
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw Errors.resourceNotFound(notePath, { path: notePath });
  }

  // I/O: Read file
  try {
    const content = await readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Errors.resourceNotFound(notePath, { path: notePath });
    }
    throw Errors.internalError(`Failed to read note: ${error.message}`, { path: notePath });
  }
}

/**
 * Write note content (I/O function with validation)
 */
export async function writeNote(vaultPath, notePath, content) {
  // Pure validations
  const paramValidation = validateRequiredParameters({ path: notePath, content }, ['path', 'content']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));
  
  const extensionValidation = validateMarkdownExtension(notePath);
  assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));
  
  const pathValidation = validatePathWithinBase(vaultPath, notePath);
  assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: notePath }));
  
  const fullPath = pathValidation.resolvedPath;
  const dir = path.dirname(fullPath);
  
  // Pure: Sanitize content
  const sanitizedContent = sanitizeContentPure(content);
  
  // I/O: Write file
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, sanitizedContent, 'utf-8');
    return notePath;
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw Errors.accessDenied(`Permission denied: ${notePath}`, { path: notePath });
    }
    throw Errors.internalError(`Failed to write note: ${error.message}`, { path: notePath });
  }
}

/**
 * Find the start and end line indices of a section by heading text.
 * End is next heading of equal or higher level, or EOF.
 */
function findSectionBounds(lines, heading) {
  const headingMatch = heading.match(/^(#+)/);
  if (!headingMatch) throw Errors.invalidParams(`Invalid heading format: "${heading}"`, { heading });
  const headingLevel = headingMatch[1].length;
  const startIdx = lines.findIndex(l => l.trim() === heading.trim());
  if (startIdx === -1) throw Errors.invalidParams(`Heading not found: "${heading}"`, { heading });
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= headingLevel) { endIdx = i; break; }
  }
  return { startIdx, endIdx };
}

/**
 * Sort single-line bullet items in a section body in-place.
 */
function sortSectionBullets(lines, startIdx, endIdx, sort) {
  const body = lines.slice(startIdx + 1, endIdx);
  const indexed = body.map((line, i) => ({ line, i, isBullet: /^- /.test(line) }));
  const bulletEntries = indexed.filter(e => e.isBullet);
  const sortedBullets = bulletEntries.map(e => e.line)
    .sort((a, b) => sort === 'desc' ? b.localeCompare(a) : a.localeCompare(b));
  bulletEntries.forEach((entry, j) => { body[entry.i] = sortedBullets[j]; });
  return body;
}

/**
 * Apply an edit operation to text content. Returns { result, insertIdx }.
 */
function applyEditOperation(text, operation, content, heading, sort) {
  const lines = text.split('\n');

  if (operation === 'append-to-file') {
    const insertIdx = lines.length;
    const result = text.endsWith('\n') ? text + content : text + '\n' + content;
    return { result, insertIdx };
  }

  const { startIdx, endIdx } = findSectionBounds(lines, heading);

  let insertIdx;
  if (operation === 'append-to-section') {
    insertIdx = endIdx;
    lines.splice(endIdx, 0, content);
    if (sort && sort !== 'none') {
      const newEndIdx = endIdx + 1;
      const sorted = sortSectionBullets(lines, startIdx, newEndIdx, sort);
      lines.splice(startIdx + 1, newEndIdx - startIdx - 1, ...sorted);
    }
  } else if (operation === 'prepend-to-section') {
    insertIdx = startIdx + 1;
    lines.splice(startIdx + 1, 0, content);
  } else if (operation === 'insert-before-section') {
    insertIdx = startIdx;
    lines.splice(startIdx, 0, content);
  } else {
    throw Errors.invalidParams(`Unknown operation: ${operation}`, { operation });
  }

  return { result: lines.join('\n'), insertIdx };
}

/**
 * Extract a few lines of context around the insertion point.
 */
function extractEditContext(text, insertIdx, radius = 3) {
  const lines = text.split('\n');
  const start = Math.max(0, insertIdx - radius);
  const end = Math.min(lines.length, insertIdx + radius + 1);
  const contextLines = [];
  for (let i = start; i < end; i++) {
    contextLines.push(lines[i]);
  }
  const prefix = start > 0 ? '...\n' : '';
  const suffix = end < lines.length ? '\n...' : '';
  return prefix + contextLines.join('\n') + suffix;
}

/**
 * Edit part of an existing note without rewriting the whole file.
 */
export async function editNote(vaultPath, notePath, operation, content, heading, sort) {
  const paramValidation = validateRequiredParameters(
    { path: notePath, operation, content }, ['path', 'operation', 'content']
  );
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));

  if (operation !== 'append-to-file') {
    if (!heading) throw Errors.invalidParams('heading is required for section operations');
  }

  const extensionValidation = validateMarkdownExtension(notePath);
  assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));

  const fullPath = await resolveNotePath(vaultPath, notePath);

  const existingContent = await readFile(fullPath, 'utf-8');

  const sanitizedContent = sanitizeContentPure(content);
  const { result, insertIdx } = applyEditOperation(existingContent, operation, sanitizedContent, heading, sort);

  await writeFile(fullPath, result, 'utf-8');

  return extractEditContext(result, insertIdx);
}

/**
 * Delete note (I/O function with validation)
 */
export async function deleteNote(vaultPath, notePath) {
  // Pure validations
  const paramValidation = validateRequiredParameters({ path: notePath }, ['path']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));
  
  const extensionValidation = validateMarkdownExtension(notePath);
  assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));
  
  const pathValidation = validatePathWithinBase(vaultPath, notePath);
  assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: notePath }));
  
  const fullPath = pathValidation.resolvedPath;
  
  // I/O: Check file exists
  try {
    await access(fullPath, constants.W_OK);
  } catch (error) {
    throw Errors.resourceNotFound(notePath, { path: notePath });
  }
  
  // I/O: Delete file
  try {
    await unlink(fullPath);
    return notePath;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Errors.resourceNotFound(notePath, { path: notePath });
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw Errors.accessDenied(`Permission denied: ${notePath}`, { path: notePath });
    }
    throw Errors.internalError(`Failed to delete note: ${error.message}`, { path: notePath });
  }
}

/**
 * Search notes by tags (I/O function using pure functions)
 */
export async function searchByTags(vaultPath, searchTags, directory = null, caseSensitive = false) {
  // Validate directory path if provided
  if (directory) {
    const pathValidation = validatePathWithinBase(vaultPath, directory);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: directory }));
  }
  
  const searchPattern = directory
    ? path.join(vaultPath, directory, '**/*.md')
    : path.join(vaultPath, '**/*.md');

  const files = await glob(searchPattern);

  // Sort files for consistent results
  files.sort();

  const results = [];
  
  for (const file of files) {
    try {
      // I/O: Read file
      const content = await readFile(file, 'utf-8');
      
      // Pure: Extract tags and check match
      const fileTags = extractTagsPure(content);
      
      if (hasAllTags(fileTags, searchTags, caseSensitive)) {
        results.push({
          path: path.relative(vaultPath, file),
          tags: fileTags
        });
      }
    } catch (error) {
      // Skip files with read errors
      continue;
    }
  }
  
  return {
    notes: results,
    count: results.length
  };
}

/**
 * Get metadata for a note or multiple notes (I/O function using pure functions)
 */
export async function getNoteMetadata(vaultPath, notePath, options = {}) {
  const { batch = false, limit = 50, offset = 0 } = options;

  // Validate that we have either a path or batch mode
  if (!notePath && !batch) {
    throw Errors.invalidParams('Either path or batch mode must be specified');
  }

  // Single note mode
  if (notePath && !batch) {
    // Validate path
    const pathValidation = validatePathWithinBase(vaultPath, notePath);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: notePath }));

    const extensionValidation = validateMarkdownExtension(notePath);
    assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));

    const fullPath = path.join(vaultPath, notePath);

    // I/O: Check file size
    const stats = await stat(fullPath);
    const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);
    assertValid(sizeValidation, (msg, data) =>
      Errors.invalidParams(msg, { path: notePath, ...data }));

    // I/O: Read file
    const content = await readFile(fullPath, 'utf-8');

    // Pure: Extract metadata
    return extractNoteMetadata(content, notePath);
  }

  // Batch mode
  const searchPattern = notePath
    ? path.join(vaultPath, notePath, '**/*.md')
    : path.join(vaultPath, '**/*.md');

  // I/O: Get files
  const allFiles = await glob(searchPattern);

  // Sort files for consistent pagination across requests
  allFiles.sort();

  // Apply pagination to file list BEFORE processing
  const { items: filesToProcess, pagination } = paginateArray(allFiles, limit, offset);

  // Process paginated files
  const metadataResults = [];

  for (const file of filesToProcess) {
    try {
      // I/O: Check file size
      const stats = await stat(file);
      const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);

      if (!sizeValidation.valid) {
        metadataResults.push({
          file,
          error: new Error(sizeValidation.error)
        });
        continue;
      }

      // I/O: Read file
      const content = await readFile(file, 'utf-8');

      // Pure: Extract metadata
      const metadata = extractNoteMetadata(content, path.relative(vaultPath, file));
      metadataResults.push({ file, metadata });
    } catch (error) {
      metadataResults.push({ file, error });
    }
  }

  // Pure: Transform results and add pagination
  const transformedResults = transformBatchMetadata(metadataResults, vaultPath);

  return {
    ...transformedResults,
    pagination
  };
}

/**
 * Discover MOCs (Maps of Content) in the vault with their linked notes
 * @param {string} vaultPath - The vault base path
 * @param {object} options - Discovery options
 * @param {string} options.mocName - Filter by specific MOC name (optional)
 * @param {string} options.directory - Limit search to specific directory (optional)
 * @returns {Promise<object>} MOCs with their metadata and linked notes
 */
export async function discoverMocs(vaultPath, options = {}) {
  const { mocName, directory, summary = true } = options;

  // Validate directory path if provided
  if (directory) {
    const pathValidation = validatePathWithinBase(vaultPath, directory);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: directory }));
  }

  // I/O: Get all markdown files
  const searchPattern = directory
    ? path.join(vaultPath, directory, '**/*.md')
    : path.join(vaultPath, '**/*.md');

  const files = await glob(searchPattern);

  // Sort files for consistent results
  files.sort();

  // Process files to find MOCs
  const mocs = [];

  for (const file of files) {
    try {
      // Filter by MOC name if specified
      if (mocName) {
        const filename = path.basename(file, '.md');
        if (filename !== mocName && !file.includes(`/${mocName}.md`)) {
          continue;
        }
      }

      // I/O: Check file size
      const stats = await stat(file);
      const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);

      if (!sizeValidation.valid) {
        continue; // Skip large files
      }

      // I/O: Read file
      const content = await readFile(file, 'utf-8');

      // Pure: Extract metadata
      const tags = extractTagsPure(content);

      // Pure: Check if this is a MOC
      if (!isMoc(content, tags)) {
        continue; // Skip non-MOC files
      }

      // Pure: Extract title and wikilinks
      const titleData = extractH1Title(content);
      const linkedNotes = extractWikilinks(content);

      // Build MOC entry
      const relativePath = path.relative(vaultPath, file);
      const moc = {
        path: relativePath,
        title: titleData ? titleData.title : path.basename(file, '.md'),
        tags: tags,
        linkedNotes: linkedNotes,
        linkCount: linkedNotes.length
      };

      mocs.push(moc);
    } catch (error) {
      // Skip files with read errors
      continue;
    }
  }

  // Detect MOC hierarchy: find which linked notes are themselves MOCs
  const mocPaths = new Set(mocs.map(m => {
    // Extract just the note name (without .md extension) for matching
    const baseName = path.basename(m.path, '.md');
    return baseName;
  }));

  // For each MOC, check if any of its linked notes are also MOCs
  mocs.forEach(moc => {
    const linkedMocs = moc.linkedNotes.filter(linkedNote => {
      // Extract just the note name from the link (handle nested paths)
      const linkedBaseName = path.basename(linkedNote, '.md');
      return mocPaths.has(linkedBaseName);
    });

    moc.linkedMocs = linkedMocs;
  });

  // In summary mode, strip linkedNotes to reduce response size
  const outputMocs = summary
    ? mocs.map(({ linkedNotes, ...rest }) => rest)
    : mocs;

  return {
    mocs: outputMocs,
    count: outputMocs.length
  };
}

// Re-export the pure extractTags function for backward compatibility
export const extractTags = extractTagsPure;