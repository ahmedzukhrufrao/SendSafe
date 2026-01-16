// ============================================================================
// Input Sanitization Module
// ============================================================================
// This file cleans up user input before we send it to OpenAI.
//
// WHY DO WE NEED THIS?
// Users can paste all kinds of text, including:
// - Hidden control characters (like backspace, bell sounds, etc.)
// - Extremely long text (which costs more money and time)
// - Malicious formatting that could confuse the AI
//
// This module makes the input safe and predictable.
// ============================================================================

import {config } from './config';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Result of sanitizing input text
 * Contains both the cleaned text and information about what was changed
 */
export interface SanitizeResult {
  sanitizedText: string;      // The cleaned-up version
  wasTruncated: boolean;      // Was it shortened?
  originalLength: number;     // Original character count
  finalLength: number;        // Final character count
  removedCharacters: number;  // How many characters were removed
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Regular expression to find control characters
 * 
 * WHAT IS A REGULAR EXPRESSION (REGEX)?
 * A pattern for finding text. Think of it like a smart "find and replace" tool.
 * 
 * BREAKING DOWN THIS REGEX:
 * [\x00-\x08]  - Characters 0 through 8 (null, bell, backspace, etc.)
 * \x0B         - Vertical tab
 * \x0C         - Form feed
 * [\x0E-\x1F]  - Characters 14 through 31 (various control codes)
 * \x7F         - Delete character
 * 
 * THE 'g' FLAG:
 * Means "global" - find ALL matches, not just the first one
 * 
 * WHY KEEP \x09, \x0A, \x0D?
 * These are tab, newline, and carriage return - we want to preserve them
 * because they're part of normal text formatting
 */
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Characters we're keeping (for documentation purposes)
 * \x09 = Tab character (normal spacing)
 * \x0A = Line feed / newline (normal line breaks)
 * \x0D = Carriage return (part of Windows line endings)
 */
// These are NOT removed by our regex above

// ---------------------------------------------------------------------------
// Main Sanitization Function
// ---------------------------------------------------------------------------

/**
 * Sanitizes and prepares text for AI analysis
 * 
 * STEPS THIS FUNCTION PERFORMS:
 * 1. Trim whitespace from edges
 * 2. Remove dangerous control characters
 * 3. Normalize line endings (make them consistent)
 * 4. Truncate if too long
 * 5. Return cleaned text plus metadata
 * 
 * @param text - The raw text pasted by the user
 * @returns SanitizeResult object with cleaned text and stats
 */
export function sanitizeInput(text: string): SanitizeResult {
  // -------------------------------------------------------------------------
  // Step 1: Record original length
  // -------------------------------------------------------------------------
  const originalLength = text.length;
  
  // -------------------------------------------------------------------------
  // Step 2: Trim whitespace from start and end
  // -------------------------------------------------------------------------
  // .trim() removes spaces, tabs, newlines from beginning and end
  // Example: "  hello  " becomes "hello"
  let cleaned = text.trim();
  
  // -------------------------------------------------------------------------
  // Step 3: Remove control characters (but keep tabs and newlines)
  // -------------------------------------------------------------------------
  // .replace() with regex finds and replaces all matches
  // CONTROL_CHAR_REGEX finds the dangerous characters
  // '' means replace with nothing (delete them)
  cleaned = cleaned.replace(CONTROL_CHAR_REGEX, '');
  
  // -------------------------------------------------------------------------
  // Step 4: Normalize line endings
  // -------------------------------------------------------------------------
  // Different operating systems use different line ending characters:
  // - Windows: \r\n (carriage return + line feed)
  // - Mac/Linux: \n (just line feed)
  // We convert everything to \n for consistency
  
  // First, replace Windows-style line endings (\r\n) with just \n
  cleaned = cleaned.replace(/\r\n/g, '\n');
  
  // Then, replace any remaining \r with \n
  cleaned = cleaned.replace(/\r/g, '\n');
  
  // -------------------------------------------------------------------------
  // Step 5: Collapse multiple consecutive newlines
  // -------------------------------------------------------------------------
  // If someone pastes text with 5 blank lines, reduce to 2
  // This keeps formatting readable but removes excessive whitespace
  // \n{3,} means "3 or more newlines in a row"
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // -------------------------------------------------------------------------
  // Step 6: Trim again (after all the replacements)
  // -------------------------------------------------------------------------
  cleaned = cleaned.trim();
  
  // -------------------------------------------------------------------------
  // Step 7: Calculate how many characters were removed so far
  // -------------------------------------------------------------------------
  const lengthAfterCleaning = cleaned.length;
  const removedCharacters = originalLength - lengthAfterCleaning;
  
  // -------------------------------------------------------------------------
  // Step 8: Truncate if text is too long
  // -------------------------------------------------------------------------
  const maxLength = config.textProcessing.maxLength;
  let wasTruncated = false;
  
  // If cleaned text is longer than our limit, cut it off
  if (cleaned.length > maxLength) {
    // .substring(start, end) extracts characters from position start to end
    // Example: "hello".substring(0, 3) returns "hel"
    cleaned = cleaned.substring(0, maxLength);
    wasTruncated = true;
  }
  
  const finalLength = cleaned.length;
  
  // -------------------------------------------------------------------------
  // Step 9: Return the result object
  // -------------------------------------------------------------------------
  return {
    sanitizedText: cleaned,
    wasTruncated,
    originalLength,
    finalLength,
    removedCharacters,
  };
}

// ---------------------------------------------------------------------------
// Validation Function
// ---------------------------------------------------------------------------

/**
 * Checks if text is valid for analysis
 * 
 * WHAT MAKES TEXT INVALID?
 * - Empty or only whitespace
 * - Too short to analyze meaningfully
 * 
 * @param text - The text to validate
 * @returns Object with isValid flag and optional error message
 */
export function validateText(text: string): {
  isValid: boolean;
  error?: string;
} {
  // Check if text is missing or empty
  if (!text) {
    return {
      isValid: false,
      error: 'Text is required',
    };
  }
  
  // Check if text is only whitespace
  // .trim() removes whitespace, so if result is empty, original was only spaces
  if (text.trim().length === 0) {
    return {
      isValid: false,
      error: 'Text cannot be empty or only whitespace',
    };
  }
  
  // Check if text is too short to analyze meaningfully
  // We need at least a few words to determine if it's AI-generated
  const MIN_LENGTH = 10; // characters
  if (text.trim().length < MIN_LENGTH) {
    return {
      isValid: false,
      error: `Text must be at least ${MIN_LENGTH} characters`,
    };
  }
  
  // If we got here, text is valid!
  return {
    isValid: true,
  };
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Counts how many control characters are in a string
 * Useful for logging and debugging
 * 
 * @param text - The text to analyze
 * @returns Count of control characters found
 */
export function countControlCharacters(text: string): number {
  // .match() returns an array of all matches, or null if no matches
  const matches = text.match(CONTROL_CHAR_REGEX);
  
  // If no matches, return 0. Otherwise, return the length of the array
  // The ? is optional chaining: safely access .length even if matches is null
  return matches?.length || 0;
}

/**
 * Creates a safe preview of text for logging
 * Truncates and removes newlines so logs are readable
 * 
 * IMPORTANT: Don't log full email content for privacy!
 * 
 * @param text - The text to preview
 * @param maxLength - Maximum length of preview (default 50)
 * @returns Safe, shortened preview
 */
export function createSafePreview(text: string, maxLength: number = 50): string {
  // Remove all newlines and replace with spaces
  let preview = text.replace(/\n/g, ' ');
  
  // Collapse multiple spaces into one
  preview = preview.replace(/\s+/g, ' ');
  
  // Trim whitespace
  preview = preview.trim();
  
  // Truncate if too long
  if (preview.length > maxLength) {
    // ... indicates there's more text
    preview = preview.substring(0, maxLength) + '...';
  }
  
  return preview;
}

// ---------------------------------------------------------------------------
// Example Usage (for documentation)
// ---------------------------------------------------------------------------

/*
EXAMPLE 1: Normal text
Input:  "Hello world"
Output: { sanitizedText: "Hello world", wasTruncated: false, ... }

EXAMPLE 2: Text with control characters
Input:  "Hello\x00world"  (contains null character)
Output: { sanitizedText: "Helloworld", wasTruncated: false, ... }

EXAMPLE 3: Text that's too long
Input:  "A".repeat(10000)  (10,000 'A' characters)
Output: { sanitizedText: "A".repeat(5000), wasTruncated: true, ... }

EXAMPLE 4: Text with excessive newlines
Input:  "Hello\n\n\n\n\nWorld"  (5 newlines)
Output: { sanitizedText: "Hello\n\nWorld", wasTruncated: false, ... }
*/

