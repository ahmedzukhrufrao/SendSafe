// ============================================================================
// Parse Detection Result Module
// ============================================================================
// This file parses OpenAI's response and converts it into a reliable,
// consistent format that our extension can use.
//
// WHY DO WE NEED THIS?
// - OpenAI returns text (JSON string) that we need to parse
// - AI might return slightly different formats
// - We need to handle errors gracefully
// - We want a consistent interface for the extension
//
// This module is the "translator" between OpenAI and our extension.
// ============================================================================

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * An individual indicator of AI copy-paste artifacts
 * These are specific markers found in the text
 */
export interface AIIndicator {
  type: string;                 // Category name (e.g., "Bracketed Placeholders")
  snippet: string;              // Exact text from the email
  explanation: string;          // Why this is a copy-paste artifact
}

/**
 * The complete detection result we return to the extension
 * This is our stable, documented API response format
 */
export interface DetectionResult {
  aiFlag: boolean;              // true if AI markers found, false if appears human
  confidence: 'low' | 'medium' | 'high';  // How confident we are in the determination
  categoriesFound: string[];    // List of marker categories detected
  indicators: AIIndicator[];    // Detailed indicators found
  reasoning: string;            // Brief explanation of the determination
}

/**
 * The raw response format we expect from OpenAI
 * OpenAI should return JSON matching this structure
 */
interface OpenAIDetectionResponse {
  aiFlag: boolean;
  confidence?: string;
  categoriesFound?: string[];
  indicators?: Array<{
    type?: string;
    snippet?: string;
    explanation?: string;
  }>;
  reasoning?: string;
}

// ---------------------------------------------------------------------------
// Main Parsing Function
// ---------------------------------------------------------------------------

/**
 * Parses OpenAI's response string into a DetectionResult
 * 
 * WHAT THIS FUNCTION DOES:
 * 1. Parse JSON string into an object
 * 2. Validate the structure
 * 3. Fill in defaults for missing fields
 * 4. Return a consistent, typed result
 * 
 * @param responseContent - The text content from OpenAI's response
 * @returns DetectionResult object ready for the extension
 * @throws Error if response is invalid or unparseable
 */
export function parseDetectionResult(responseContent: string): DetectionResult {
  // -------------------------------------------------------------------------
  // Step 1: Parse JSON
  // -------------------------------------------------------------------------
  let parsed: OpenAIDetectionResponse;
  
  try {
    // JSON.parse() converts a JSON string into a JavaScript object
    // Example: '{"aiFlag": true}' becomes { aiFlag: true }
    parsed = JSON.parse(responseContent);
  } catch (error) {
    // If JSON is invalid, throw a clear error
    // This could happen if OpenAI returns malformed JSON
    throw new Error(
      `Failed to parse OpenAI response as JSON. ` +
      `Response was: ${responseContent.substring(0, 200)}... ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  
  // -------------------------------------------------------------------------
  // Step 2: Validate required field (aiFlag)
  // -------------------------------------------------------------------------
  // The only truly required field is aiFlag (true/false detection result)
  // typeof checks the JavaScript type of a value
  if (typeof parsed.aiFlag !== 'boolean') {
    throw new Error(
      `OpenAI response missing or invalid 'aiFlag' field. ` +
      `Expected boolean, got: ${typeof parsed.aiFlag}. ` +
      `Full response: ${JSON.stringify(parsed)}`
    );
  }
  
  // -------------------------------------------------------------------------
  // Step 3: Validate and normalize confidence level
  // -------------------------------------------------------------------------
  const validConfidenceLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
  let confidence: 'low' | 'medium' | 'high' = 'medium';  // Default
  
  if (parsed.confidence) {
    // .toLowerCase() converts to lowercase for case-insensitive comparison
    // Example: "HIGH" becomes "high"
    const normalizedConfidence = parsed.confidence.toLowerCase();
    
    // Check if it's one of our valid values
    // 'as any' is a TypeScript trick to check if value is in the array
    if (validConfidenceLevels.includes(normalizedConfidence as any)) {
      confidence = normalizedConfidence as 'low' | 'medium' | 'high';
    } else {
      // If invalid value, log a warning but continue with default
      console.warn(
        `Invalid confidence level: ${parsed.confidence}. ` +
        `Using default: ${confidence}`
      );
    }
  }
  
  // -------------------------------------------------------------------------
  // Step 4: Validate and normalize categories
  // -------------------------------------------------------------------------
  let categoriesFound: string[] = [];
  
  if (parsed.categoriesFound) {
    // Array.isArray() checks if something is an array
    if (Array.isArray(parsed.categoriesFound)) {
      // Filter to only include strings, and trim whitespace
      // .filter() creates a new array with only items that pass the test
      // .map() transforms each item (here, we trim whitespace)
      categoriesFound = parsed.categoriesFound
        .filter(cat => typeof cat === 'string')  // Only keep strings
        .map(cat => cat.trim())                  // Remove extra spaces
        .filter(cat => cat.length > 0);          // Remove empty strings
    } else {
      console.warn(
        `categoriesFound is not an array. Got: ${typeof parsed.categoriesFound}`
      );
    }
  }
  
  // -------------------------------------------------------------------------
  // Step 5: Validate and normalize indicators
  // -------------------------------------------------------------------------
  let indicators: AIIndicator[] = [];
  
  if (parsed.indicators) {
    if (Array.isArray(parsed.indicators)) {
      // Transform raw indicators into our typed format
      // We need to validate each field and provide defaults
      indicators = parsed.indicators
        .filter(ind => {
          // Only include indicators that have at least a type
          return ind && typeof ind.type === 'string' && ind.type.trim().length > 0;
        })
        .map(ind => {
          // Return normalized indicator with snippet and explanation
          return {
            type: ind.type!.trim(),                            // ! tells TypeScript "I'm sure this exists"
            snippet: ind.snippet?.trim() || '',                // Exact text from email
            explanation: ind.explanation?.trim() || '',        // Why this is an artifact
          };
        });
    } else {
      console.warn(
        `indicators is not an array. Got: ${typeof parsed.indicators}`
      );
    }
  }
  
  // -------------------------------------------------------------------------
  // Step 6: Get reasoning (with default if missing)
  // -------------------------------------------------------------------------
  const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning.trim().length > 0
    ? parsed.reasoning.trim()
    : 'No reasoning provided';  // Default if missing or empty
  
  // -------------------------------------------------------------------------
  // Step 7: Return the validated and normalized result
  // -------------------------------------------------------------------------
  return {
    aiFlag: parsed.aiFlag,
    confidence,
    categoriesFound,
    indicators,
    reasoning,
  };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Creates a safe error result when parsing fails completely
 * Instead of crashing, we return a result indicating an error occurred
 * 
 * @param errorMessage - Description of what went wrong
 * @returns DetectionResult indicating an error state
 */
export function createErrorResult(errorMessage: string): DetectionResult {
  return {
    aiFlag: false,              // Default to not flagging on error
    confidence: 'low',          // Low confidence since we couldn't analyze
    categoriesFound: [],
    indicators: [],
    reasoning: `Error during analysis: ${errorMessage}`,
  };
}

/**
 * Validates that a DetectionResult has all required fields
 * Useful for testing and debugging
 * 
 * @param result - The result to validate
 * @returns true if valid, false otherwise
 */
export function isValidDetectionResult(result: any): result is DetectionResult {
  // Check that all required fields exist and have correct types
  return (
    result !== null &&
    typeof result === 'object' &&
    typeof result.aiFlag === 'boolean' &&
    ['low', 'medium', 'high'].includes(result.confidence) &&
    Array.isArray(result.categoriesFound) &&
    Array.isArray(result.indicators) &&
    typeof result.reasoning === 'string'
  );
}

/**
 * Creates a summary message for notifications
 * Converts technical detection result into user-friendly text
 * 
 * @param result - The detection result
 * @returns User-friendly summary string
 */
export function createNotificationMessage(result: DetectionResult): string {
  // If no AI detected, return positive message
  if (!result.aiFlag) {
    return 'No AI-generated patterns detected.';
  }
  
  // Build message about what was found
  const categoryCount = result.categoriesFound.length;
  const indicatorCount = result.indicators.length;
  
  // Start with main message
  let message = `⚠️ Possible AI-generated content detected (${result.confidence} confidence)`;
  
  // Add category information
  if (categoryCount > 0) {
    message += `\n\nCategories found: ${result.categoriesFound.join(', ')}`;
  }
  
  // Add indicator count
  if (indicatorCount > 0) {
    message += `\n\n${indicatorCount} specific indicator${indicatorCount > 1 ? 's' : ''} identified.`;
  }
  
  // Add reasoning if available and not default
  if (result.reasoning && result.reasoning !== 'No reasoning provided') {
    // Truncate reasoning if too long (for notification display)
    const maxReasoningLength = 150;
    let reasoning = result.reasoning;
    if (reasoning.length > maxReasoningLength) {
      reasoning = reasoning.substring(0, maxReasoningLength) + '...';
    }
    message += `\n\n${reasoning}`;
  }
  
  return message;
}

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

/**
 * Type guard to check if a value is a valid confidence level
 * 
 * @param value - The value to check
 * @returns true if value is 'low', 'medium', or 'high'
 */
export function isValidConfidence(value: any): value is 'low' | 'medium' | 'high' {
  return ['low', 'medium', 'high'].includes(value);
}

// ---------------------------------------------------------------------------
// Example Usage (for documentation)
// ---------------------------------------------------------------------------

/*
EXAMPLE 1: Valid OpenAI response (Copy-Paste Artifacts Detected)

const openaiResponse = `{
  "aiFlag": true,
  "confidence": "high",
  "categoriesFound": ["Introductory Remnants", "Bracketed Placeholders"],
  "indicators": [
    {
      "type": "Introductory Remnants",
      "snippet": "Sure, here's a professional email for you:",
      "explanation": "This acknowledges the user's request and reveals the content was AI-generated"
    },
    {
      "type": "Bracketed Placeholders",
      "snippet": "[Your Name]",
      "explanation": "Template placeholder that needs to be replaced with actual information"
    }
  ],
  "reasoning": "Multiple copy-paste artifacts detected indicating text was copied directly from AI interface without editing"
}`;

const result = parseDetectionResult(openaiResponse);
console.log(result.aiFlag);           // true
console.log(result.confidence);       // "high"
console.log(result.categoriesFound);  // ["Introductory Remnants", "Bracketed Placeholders"]
console.log(result.indicators[0].snippet);  // "Sure, here's a professional email for you:"

EXAMPLE 2: Handling invalid response

try {
  const result = parseDetectionResult("not valid json");
} catch (error) {
  console.error("Failed to parse:", error.message);
  const fallback = createErrorResult(error.message);
  // Use fallback result
}

EXAMPLE 3: Creating notification message

const result = parseDetectionResult(openaiResponse);
const message = createNotificationMessage(result);
console.log(message);
// "⚠️ Possible AI-generated content detected (high confidence)
//  Categories found: Introductory Remnants, Bracketed Placeholders
//  2 specific indicators identified."
*/

