// ============================================================================
// AI Detection API Endpoint
// ============================================================================
// This is the main API endpoint that the Chrome extension calls.
//
// WHAT THIS ENDPOINT DOES:
// 1. Receives text from the extension
// 2. Validates the request (auth, rate limits, input)
// 3. Sanitizes the text
// 4. Calls OpenAI for analysis
// 5. Parses and returns results
//
// URL: POST /api/check-ai-traces
// ============================================================================

/**
 * VERCEL SERVERLESS FUNCTIONS:
 * 
 * This file exports a function that Vercel will automatically
 * turn into an API endpoint.
 * 
 * File location:    backend/api/check-ai-traces.ts
 * Becomes URL:      https://your-domain.vercel.app/api/check-ai-traces
 * 
 * HOW IT WORKS:
 * - Export a function that takes (request, response)
 * - Vercel calls this function when someone hits the URL
 * - We process the request and send back a response
 * 
 * Think of it like a waiter at a restaurant:
 * - Request = customer's order
 * - Your code = kitchen cooking
 * - Response = serving the food back
 */

// Import Node.js types for requests and responses
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import our library modules
import { config } from '../lib/config';
import { sanitizeInput, validateText } from '../lib/sanitizeInput';
import { detectAIContent, estimateRequestCost } from '../lib/openaiClient';
import { parseDetectionResult } from '../lib/parseDetectionResult';
import { checkRateLimit, extractIPAddress, RATE_LIMIT_HEADERS } from '../lib/rateLimit';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * The request body we expect from the extension
 */
interface RequestBody {
  text: string;               // The text to analyze
}

/**
 * Success response format
 */
interface SuccessResponse {
  aiFlag: boolean;
  confidence: 'low' | 'medium' | 'high';
  categoriesFound: string[];
  indicators: Array<{
    type: string;
    snippet: string;
    explanation: string;
  }>;
  reasoning: string;
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;              // Error message
  code?: string;              // Error code for programmatic handling
  retryAfter?: number;        // Seconds to wait before retrying (for rate limits)
}

// ---------------------------------------------------------------------------
// Main Handler Function
// ---------------------------------------------------------------------------

/**
 * Main API endpoint handler
 * 
 * This is the entry point that Vercel calls
 * Default export means Vercel will automatically use this as the handler
 * 
 * @param req - The incoming request
 * @param res - The response object we'll use to send data back
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // -------------------------------------------------------------------------
  // Step 1: CORS headers (allow extension to call from browser)
  // -------------------------------------------------------------------------
  /**
   * WHAT IS CORS?
   * Cross-Origin Resource Sharing - a security feature in browsers.
   * By default, browsers block requests from one domain to another.
   * We need to explicitly allow our extension to call our API.
   * 
   * For MVP, we're allowing all origins (*).
   * In production, you'd restrict to your extension's origin.
   */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SendSafe-Secret');
  
  // Handle preflight requests (browsers send OPTIONS before POST)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // -------------------------------------------------------------------------
  // Step 2: Check HTTP method
  // -------------------------------------------------------------------------
  // We only accept POST requests (sending data)
  // GET is for retrieving, POST is for sending/processing
  
  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed. This endpoint only accepts POST requests.',
      code: 'METHOD_NOT_ALLOWED',
    } as ErrorResponse);
    return;
  }
  
  try {
    // -----------------------------------------------------------------------
    // Step 3: Validate shared secret (authentication)
    // -----------------------------------------------------------------------
    // The extension must provide the correct secret in a header
    // This is our MVP approach to prevent random people using the API
    
    const providedSecret = req.headers['x-sendsafe-secret'];
    
    if (!providedSecret) {
      res.status(401).json({
        error: 'Missing authentication. X-SendSafe-Secret header is required.',
        code: 'MISSING_AUTH',
      } as ErrorResponse);
      return;
    }
    
    if (providedSecret !== config.security.sharedSecret) {
      // Don't reveal if the secret is wrong - just say unauthorized
      // This prevents attackers from knowing if they're close
      res.status(403).json({
        error: 'Invalid authentication credentials.',
        code: 'INVALID_AUTH',
      } as ErrorResponse);
      return;
    }
    
    // -----------------------------------------------------------------------
    // Step 4: Check rate limiting
    // -----------------------------------------------------------------------
    // Extract IP address and check if they've exceeded limits
    
    const ipAddress = extractIPAddress(req.headers);
    const rateLimitResult = checkRateLimit(ipAddress);
    
    // Always include rate limit headers in response
    res.setHeader(
      RATE_LIMIT_HEADERS.LIMIT,
      config.rateLimit.maxRequests.toString()
    );
    res.setHeader(
      RATE_LIMIT_HEADERS.REMAINING,
      rateLimitResult.remaining.toString()
    );
    res.setHeader(
      RATE_LIMIT_HEADERS.RESET,
      rateLimitResult.resetTime.toString()
    );
    
    // If rate limit exceeded, return 429
    if (!rateLimitResult.allowed) {
      res.setHeader(
        RATE_LIMIT_HEADERS.RETRY_AFTER,
        rateLimitResult.retryAfter!.toString()
      );
      
      res.status(429).json({
        error: `Rate limit exceeded. Maximum ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMinutes} minutes.`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: rateLimitResult.retryAfter,
      } as ErrorResponse);
      return;
    }
    
    // -----------------------------------------------------------------------
    // Step 5: Parse and validate request body
    // -----------------------------------------------------------------------
    // The request body should contain JSON with a 'text' field
    
    // req.body is already parsed by Vercel (automatic JSON parsing)
    const body = req.body as RequestBody;
    
    // Check if text field exists
    if (!body || !body.text) {
      res.status(400).json({
        error: 'Bad request. Request body must include a "text" field.',
        code: 'MISSING_TEXT',
      } as ErrorResponse);
      return;
    }
    
    // Validate text content
    const validation = validateText(body.text);
    if (!validation.isValid) {
      res.status(400).json({
        error: validation.error || 'Invalid text input',
        code: 'INVALID_TEXT',
      } as ErrorResponse);
      return;
    }
    
    // -----------------------------------------------------------------------
    // Step 6: Sanitize input
    // -----------------------------------------------------------------------
    // Clean up the text before sending to OpenAI
    
    const sanitizeResult = sanitizeInput(body.text);
    
    // Log sanitization info (but not the actual text for privacy)
    console.log('Text sanitized:', {
      originalLength: sanitizeResult.originalLength,
      finalLength: sanitizeResult.finalLength,
      wasTruncated: sanitizeResult.wasTruncated,
      removedCharacters: sanitizeResult.removedCharacters,
    });
    
    // -----------------------------------------------------------------------
    // Step 7: Call OpenAI for analysis
    // -----------------------------------------------------------------------
    console.log('Calling OpenAI for analysis...');
    
    const openaiResponse = await detectAIContent(sanitizeResult.sanitizedText);
    
    // Log response info (but not the content)
    console.log('OpenAI response received:', {
      finishReason: openaiResponse.finishReason,
      tokensUsed: openaiResponse.tokensUsed,
    });
    
    // Check if response completed successfully
    if (openaiResponse.finishReason !== 'stop') {
      // 'stop' means completed normally
      // Other values like 'length' mean it hit token limit
      console.warn(`OpenAI finished with reason: ${openaiResponse.finishReason}`);
      
      if (openaiResponse.finishReason === 'length') {
        // Response was cut off - might be incomplete
        res.status(500).json({
          error: 'Analysis incomplete. Response exceeded maximum length.',
          code: 'ANALYSIS_INCOMPLETE',
        } as ErrorResponse);
        return;
      }
    }
    
    // -----------------------------------------------------------------------
    // Step 8: Parse OpenAI's response
    // -----------------------------------------------------------------------
    let detectionResult;
    
    try {
      detectionResult = parseDetectionResult(openaiResponse.content);
    } catch (parseError) {
      // If parsing fails, log the error but return a generic error to user
      console.error('Failed to parse OpenAI response:', parseError);
      console.error('Raw response:', openaiResponse.content);
      
      res.status(500).json({
        error: 'Failed to parse analysis results. Please try again.',
        code: 'PARSE_ERROR',
      } as ErrorResponse);
      return;
    }
    
    // -----------------------------------------------------------------------
    // Step 9: Log analytics (no sensitive data)
    // -----------------------------------------------------------------------
    const cost = estimateRequestCost(openaiResponse.tokensUsed);
    
    console.log('Request completed:', {
      aiFlag: detectionResult.aiFlag,
      confidence: detectionResult.confidence,
      categoriesFound: detectionResult.categoriesFound.length,
      indicatorsFound: detectionResult.indicators.length,
      tokensUsed: openaiResponse.tokensUsed.total,
      estimatedCost: `$${cost.toFixed(6)}`,
      ipAddress: ipAddress,  // For monitoring abuse
      wasTruncated: sanitizeResult.wasTruncated,
    });
    
    // -----------------------------------------------------------------------
    // Step 10: Return success response
    // -----------------------------------------------------------------------
    res.status(200).json({
      aiFlag: detectionResult.aiFlag,
      confidence: detectionResult.confidence,
      categoriesFound: detectionResult.categoriesFound,
      indicators: detectionResult.indicators,
      reasoning: detectionResult.reasoning,
    } as SuccessResponse);
    
  } catch (error) {
    // -----------------------------------------------------------------------
    // Global error handler
    // -----------------------------------------------------------------------
    // Catch any unexpected errors and return a safe message
    
    console.error('Unexpected error in API handler:', error);
    
    // Don't expose internal error details to client
    // Log them for debugging, but return generic message
    res.status(500).json({
      error: 'Internal server error. Please try again later.',
      code: 'INTERNAL_ERROR',
    } as ErrorResponse);
  }
}

// ---------------------------------------------------------------------------
// Helper Functions (if needed for testing)
// ---------------------------------------------------------------------------

/**
 * Validates request headers
 * Exported for testing purposes
 */
export function validateHeaders(headers: Record<string, any>): {
  isValid: boolean;
  error?: string;
} {
  // Check for required headers
  if (!headers['x-sendsafe-secret']) {
    return {
      isValid: false,
      error: 'Missing X-SendSafe-Secret header',
    };
  }
  
  // Check Content-Type for POST requests
  const contentType = headers['content-type'];
  if (contentType && !contentType.includes('application/json')) {
    return {
      isValid: false,
      error: 'Content-Type must be application/json',
    };
  }
  
  return { isValid: true };
}

// ---------------------------------------------------------------------------
// Documentation Comments
// ---------------------------------------------------------------------------

/**
 * API ENDPOINT DOCUMENTATION
 * 
 * URL: POST /api/check-ai-traces
 * 
 * Headers:
 *   X-SendSafe-Secret: <your-shared-secret>
 *   Content-Type: application/json
 * 
 * Request Body:
 *   {
 *     "text": "The text to analyze for AI generation"
 *   }
 * 
 * Success Response (200):
 *   {
 *     "aiFlag": true,
 *     "confidence": "high",
 *     "categoriesFound": ["Introductory Remnants", "Bracketed Placeholders"],
 *     "indicators": [
 *       {
 *         "type": "Introductory Remnants",
 *         "snippet": "Sure, here's a professional email for you:",
 *         "explanation": "This acknowledges the user's request and reveals the content was AI-generated"
 *       }
 *     ],
 *     "reasoning": "Text shows multiple indicators..."
 *   }
 * 
 * Error Responses:
 *   401: Missing authentication
 *   403: Invalid authentication
 *   400: Bad request (missing/invalid text)
 *   429: Rate limit exceeded
 *   500: Internal server error
 * 
 * Rate Limit Headers (included in all responses):
 *   X-RateLimit-Limit: Maximum requests per window
 *   X-RateLimit-Remaining: Requests remaining
 *   X-RateLimit-Reset: Timestamp when window resets
 *   Retry-After: Seconds to wait (only on 429)
 */

