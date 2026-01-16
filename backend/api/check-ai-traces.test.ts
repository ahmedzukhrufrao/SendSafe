// ============================================================================
// API Endpoint Tests - check-ai-traces
// ============================================================================
// Tests for the main API endpoint that handles detection requests
//
// WHY TEST THIS?
// - Ensures authentication works (401/403 errors)
// - Verifies rate limiting (429 errors)
// - Validates input handling (400 errors)
// - Confirms error responses are user-friendly
//
// HOW TO RUN THESE TESTS:
// - Run all tests: npm test
// - Run this file only: npm test check-ai-traces.test.ts
// - Watch mode: npm run test:watch
//
// NOTE: These tests mock the dependencies (OpenAI, rate limiter)
// to test the endpoint logic without actually calling external services.
// ============================================================================

import { VercelRequest, VercelResponse } from '@vercel/node';

// Set test environment variables before any imports
process.env.OPENAI_API_KEY = 'sk-test-dummy-key-for-testing';
process.env.OPENAI_MODEL = 'gpt-4o-mini';
process.env.OPENAI_TIMEOUT = '10000';
process.env.SENDSAFE_SHARED_SECRET = 'test-secret-123';
process.env.RATE_LIMIT_MAX_REQUESTS = '10';
process.env.RATE_LIMIT_WINDOW_MINUTES = '60';
process.env.MAX_TEXT_LENGTH = '5000';

// Mock all external dependencies BEFORE importing the handler
jest.mock('../lib/config', () => ({
  config: {
    security: {
      sharedSecret: 'test-secret-123',  // Match what tests use
    },
    textProcessing: {
      maxLength: 5000,
    },
    openai: {
      apiKey: 'sk-test-dummy-key-for-testing',
      model: 'gpt-4o-mini',
      timeout: 10000,
    },
    rateLimit: {
      maxRequests: 10,
      windowMinutes: 60,
    },
  },
}));
jest.mock('../lib/sanitizeInput');
jest.mock('../lib/openaiClient');
jest.mock('../lib/parseDetectionResult');
jest.mock('../lib/rateLimit');

// Import mocked modules
import { config } from '../lib/config';
import { sanitizeInput, validateText } from '../lib/sanitizeInput';
import { detectAIContent, estimateRequestCost } from '../lib/openaiClient';
import { parseDetectionResult } from '../lib/parseDetectionResult';
import { checkRateLimit, extractIPAddress } from '../lib/rateLimit';

// Import handler AFTER mocks are set up
import handler from './check-ai-traces';

// ---------------------------------------------------------------------------
// Helper Functions for Testing
// ---------------------------------------------------------------------------

/**
 * Creates a mock Vercel request object for testing
 */
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: {},
    body: {},
    query: {},
    cookies: {},
    ...overrides,
  } as VercelRequest;
}

/**
 * Creates a mock Vercel response object that tracks what was sent
 */
function createMockResponse(): VercelResponse & {
  statusCode?: number;
  sentData?: any;
  sentHeaders?: Record<string, string>;
} {
  const res: any = {
    statusCode: undefined,
    sentData: undefined,
    sentHeaders: {} as Record<string, string>,
    
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    
    json(data: any) {
      this.sentData = data;
      return this;
    },
    
    setHeader(name: string, value: string) {
      this.sentHeaders[name] = value;
      return this;
    },
    
    end() {
      return this;
    },
  };
  
  return res as VercelResponse;
}

/**
 * Setup default mock implementations
 */
function setupDefaultMocks() {
  // Config is already mocked via jest.mock factory above

  // Mock IP extraction
  (extractIPAddress as jest.Mock).mockReturnValue('192.168.1.1');

  // Mock text validation to pass by default
  (validateText as jest.Mock).mockReturnValue({ 
    isValid: true, 
    error: undefined 
  });

  // Mock text sanitization - returns SanitizeResult object
  (sanitizeInput as jest.Mock).mockImplementation((text: string) => ({
    sanitizedText: text,
    wasTruncated: false,
    originalLength: text?.length || 0,
    finalLength: text?.length || 0,
    removedCharacters: 0,
  }));

  // Mock rate limit to pass by default
  (checkRateLimit as jest.Mock).mockReturnValue({
    allowed: true,
    remaining: 9,
    resetTime: Date.now() + 3600000,
  });

  // Mock OpenAI detection - returns OpenAIResponse object
  (detectAIContent as jest.Mock).mockResolvedValue({
    content: JSON.stringify({
      aiFlag: false,
      confidence: 'high',
      categoriesFound: [],
      indicators: [],
      reasoning: 'No AI patterns detected',
    }),
    finishReason: 'stop',
    tokensUsed: {
      prompt: 100,
      completion: 50,
      total: 150,
    },
  });

  // Mock cost estimation - returns a number (cost in dollars)
  (estimateRequestCost as jest.Mock).mockReturnValue(0.00015);

  // Mock parse detection result
  (parseDetectionResult as jest.Mock).mockReturnValue({
    aiFlag: false,
    confidence: 'high',
    categoriesFound: [],
    indicators: [],
    reasoning: 'No AI patterns detected',
  });
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('API Endpoint: check-ai-traces', () => {
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // -------------------------------------------------------------------------
  // Category 1: HTTP Method Validation
  // -------------------------------------------------------------------------

  describe('HTTP Method Validation', () => {
    it('should reject GET requests with 405', async () => {
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.sentData).toHaveProperty('error');
      expect(res.sentData.error).toContain('Method not allowed');
    });

    it('should reject PUT requests with 405', async () => {
      const req = createMockRequest({ method: 'PUT' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(405);
    });

    it('should accept POST requests', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Category 2: Authentication (401/403 Errors)
  // -------------------------------------------------------------------------

  describe('Authentication - Missing Shared Secret', () => {
    it('should return 401 when shared secret header is missing', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: {}, // No secret header
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.sentData).toHaveProperty('error');
      expect(res.sentData.error).toContain('Missing authentication');
    });

    it('should return 401 when shared secret header is empty', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': '' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('Authentication - Invalid Shared Secret', () => {
    it('should return 403 when shared secret is incorrect', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'wrong-secret' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.sentData).toHaveProperty('error');
      expect(res.sentData.error).toContain('Invalid authentication');
    });

    it('should be case-sensitive for shared secret', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'TEST-SECRET-123' }, // Wrong case
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Category 3: Input Validation (400 Errors)
  // -------------------------------------------------------------------------

  describe('Input Validation - Missing Text Field', () => {
    it('should return 400 when text field is missing', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: {}, // No text field
      });
      const res = createMockResponse();

      (validateText as jest.Mock).mockReturnValue({
        isValid: false,
        error: 'Text field is required',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.sentData).toHaveProperty('error');
      expect(res.sentData.error).toContain('text');
    });

    it('should return 400 when text is not a string', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 12345 }, // Number instead of string
      });
      const res = createMockResponse();

      (validateText as jest.Mock).mockReturnValue({
        isValid: false,
        error: 'Text must be a string',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Input Validation - Empty or Whitespace Text', () => {
    it('should return 400 for empty text', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: '' },
      });
      const res = createMockResponse();

      // Note: Empty string is falsy, so it triggers the "missing text" check
      // before validateText is even called
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      // Empty string triggers the "must include a text field" error
      expect(res.sentData.error).toContain('text');
    });

    it('should return 400 for whitespace-only text', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: '   \n\t  ' },
      });
      const res = createMockResponse();

      (validateText as jest.Mock).mockReturnValue({
        isValid: false,
        error: 'Text cannot be empty or whitespace only',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Input Validation - Text Too Long', () => {
    it('should return 400 when text exceeds maximum length', async () => {
      const longText = 'A'.repeat(10000); // Exceeds 5000 char limit
      
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: longText },
      });
      const res = createMockResponse();

      (validateText as jest.Mock).mockReturnValue({
        isValid: false,
        error: 'Text exceeds maximum length of 5000 characters',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.sentData.error).toContain('maximum length');
    });
  });

  // -------------------------------------------------------------------------
  // Category 4: Rate Limiting (429 Errors)
  // -------------------------------------------------------------------------

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      // Mock rate limit exceeded
      (checkRateLimit as jest.Mock).mockReturnValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 1800000, // 30 minutes
        retryAfter: 1800, // seconds
      });

      await handler(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.sentData).toHaveProperty('error');
      expect(res.sentData.error).toContain('Rate limit exceeded');
      expect(res.sentData).toHaveProperty('retryAfter');
    });

    it('should include Retry-After header when rate limited', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      (checkRateLimit as jest.Mock).mockReturnValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 3600000,
        retryAfter: 3600,
      });

      await handler(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.sentHeaders!['Retry-After']).toBe('3600');
    });

    it('should include X-RateLimit headers in response', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      const resetTime = Date.now() + 3600000;
      (checkRateLimit as jest.Mock).mockReturnValue({
        allowed: true,
        remaining: 5,
        resetTime: resetTime,
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.sentHeaders!['X-RateLimit-Remaining']).toBe('5');
      // The API returns resetTime in milliseconds as-is
      expect(res.sentHeaders!['X-RateLimit-Reset']).toBe(resetTime.toString());
    });
  });

  // -------------------------------------------------------------------------
  // Category 5: Successful Requests (200 Responses)
  // -------------------------------------------------------------------------

  describe('Successful Detection Requests', () => {
    it('should return 200 with detection result for valid request', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Hello, this is a test email.' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.sentData).toHaveProperty('aiFlag');
      expect(res.sentData).toHaveProperty('confidence');
      expect(res.sentData).toHaveProperty('categoriesFound');
      expect(res.sentData).toHaveProperty('indicators');
      expect(res.sentData).toHaveProperty('reasoning');
    });

    it('should call sanitizeInput with the provided text', async () => {
      const testText = 'Test email content';
      
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: testText },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(sanitizeInput).toHaveBeenCalledWith(testText);
    });

    it('should call detectAIContent with sanitized text', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      // Mock sanitizeInput to return a SanitizeResult with custom sanitizedText
      (sanitizeInput as jest.Mock).mockReturnValue({
        sanitizedText: 'Sanitized test content',
        wasTruncated: false,
        originalLength: 12,
        finalLength: 22,
        removedCharacters: 0,
      });

      await handler(req, res);

      expect(detectAIContent).toHaveBeenCalledWith('Sanitized test content');
    });

    it('should return AI detection result when traces found', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Sure, here is your email: [Your Name]' },
      });
      const res = createMockResponse();

      // Mock AI traces detected - detectAIContent returns OpenAIResponse object
      (detectAIContent as jest.Mock).mockResolvedValue({
        content: JSON.stringify({
          aiFlag: true,
          confidence: 'high',
          categoriesFound: ['Introductory Remnants', 'Bracketed Placeholders'],
          indicators: [
            {
              type: 'Introductory Remnants',
              snippet: 'Sure, here is your email:',
              explanation: 'AI acknowledgment phrase',
            },
          ],
          reasoning: 'Multiple AI artifacts detected',
        }),
        finishReason: 'stop',
        tokensUsed: {
          prompt: 100,
          completion: 80,
          total: 180,
        },
      });

      (parseDetectionResult as jest.Mock).mockReturnValue({
        aiFlag: true,
        confidence: 'high',
        categoriesFound: ['Introductory Remnants', 'Bracketed Placeholders'],
        indicators: [
          {
            type: 'Introductory Remnants',
            snippet: 'Sure, here is your email:',
            explanation: 'AI acknowledgment phrase',
          },
        ],
        reasoning: 'Multiple AI artifacts detected',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.sentData.aiFlag).toBe(true);
      expect(res.sentData.confidence).toBe('high');
      expect(res.sentData.categoriesFound).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Category 6: Error Handling for External Service Failures
  // -------------------------------------------------------------------------

  describe('External Service Error Handling', () => {
    it('should return 500 when OpenAI call fails', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      // Mock OpenAI failure
      (detectAIContent as jest.Mock).mockRejectedValue(
        new Error('OpenAI API timeout')
      );

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.sentData).toHaveProperty('error');
      // Generic error message - doesn't expose internal details
      expect(res.sentData.error).toContain('Internal server error');
    });

    it('should return 500 when parsing fails', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      // Mock parsing failure
      (parseDetectionResult as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid response format');
      });

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.sentData.error).toContain('Failed to parse analysis results');
    });

    it('should not expose internal error details in response', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      (detectAIContent as jest.Mock).mockRejectedValue(
        new Error('Internal API key invalid')
      );

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.sentData.error).not.toContain('API key');
      // Generic error message - doesn't expose internal details
      expect(res.sentData.error).toContain('Internal server error');
    });
  });

  // -------------------------------------------------------------------------
  // Category 7: CORS Headers
  // -------------------------------------------------------------------------

  describe('CORS Headers', () => {
    it('should include CORS headers in successful response', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.sentHeaders!['Access-Control-Allow-Origin']).toBeDefined();
      expect(res.sentHeaders!['Access-Control-Allow-Methods']).toBeDefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const req = createMockRequest({ method: 'OPTIONS' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.sentHeaders!['Access-Control-Allow-Origin']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Category 8: Security - No Sensitive Data in Responses
  // -------------------------------------------------------------------------

  describe('Security - Response Content', () => {
    it('should not include OpenAI API key in any response', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      await handler(req, res);

      const responseStr = JSON.stringify(res.sentData);
      expect(responseStr).not.toContain('sk-');
      expect(responseStr).not.toContain('api_key');
      expect(responseStr).not.toContain('OPENAI');
    });

    it('should not include shared secret in response', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'test-secret-123' },
        body: { text: 'Test content' },
      });
      const res = createMockResponse();

      await handler(req, res);

      const responseStr = JSON.stringify(res.sentData);
      expect(responseStr).not.toContain('test-secret-123');
    });

    it('should not include user text in error responses', async () => {
      const sensitiveText = 'My password is secret123';
      
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-sendsafe-secret': 'wrong-secret' },
        body: { text: sensitiveText },
      });
      const res = createMockResponse();

      await handler(req, res);

      const responseStr = JSON.stringify(res.sentData);
      expect(responseStr).not.toContain(sensitiveText);
    });
  });
});

// ============================================================================
// End of Tests
// ============================================================================

