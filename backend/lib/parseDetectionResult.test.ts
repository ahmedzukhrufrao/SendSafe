// ============================================================================
// parseDetectionResult Tests
// ============================================================================
// Automated tests for the OpenAI response parsing logic
//
// WHY TEST THIS?
// - Parsing is critical: if we parse wrong, we'll show incorrect results
// - OpenAI might return unexpected formats
// - We need to handle edge cases gracefully
//
// HOW TO RUN THESE TESTS:
// - Run all tests: npm test
// - Run this file only: npm test parseDetectionResult.test.ts
// - Watch mode (auto-rerun): npm run test:watch
// ============================================================================

import {
  parseDetectionResult,
  createErrorResult,
  isValidDetectionResult,
  createNotificationMessage,
  isValidConfidence,
  DetectionResult,
} from './parseDetectionResult';

// ---------------------------------------------------------------------------
// Test Suite: parseDetectionResult()
// ---------------------------------------------------------------------------

describe('parseDetectionResult', () => {
  
  // -------------------------------------------------------------------------
  // Category 1: Valid Responses (Happy Path)
  // -------------------------------------------------------------------------
  
  describe('Valid AI Detection Response', () => {
    it('should parse a valid response with AI traces detected', () => {
      const validResponse = JSON.stringify({
        aiFlag: true,
        confidence: 'high',
        categoriesFound: ['Introductory Remnants', 'Bracketed Placeholders'],
        indicators: [
          {
            type: 'Introductory Remnants',
            snippet: 'Sure, here is your email:',
            explanation: 'This acknowledges the user request'
          },
          {
            type: 'Bracketed Placeholders',
            snippet: '[Your Name]',
            explanation: 'Template placeholder needs replacement'
          }
        ],
        reasoning: 'Multiple artifacts detected indicating AI-generated content'
      });

      const result = parseDetectionResult(validResponse);

      expect(result.aiFlag).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.categoriesFound).toEqual(['Introductory Remnants', 'Bracketed Placeholders']);
      expect(result.indicators).toHaveLength(2);
      expect(result.indicators[0].type).toBe('Introductory Remnants');
      expect(result.indicators[0].snippet).toBe('Sure, here is your email:');
      expect(result.reasoning).toBe('Multiple artifacts detected indicating AI-generated content');
    });

    it('should parse a valid response with no AI traces (clean content)', () => {
      const validResponse = JSON.stringify({
        aiFlag: false,
        confidence: 'high',
        categoriesFound: [],
        indicators: [],
        reasoning: 'No AI-generated patterns detected in the text'
      });

      const result = parseDetectionResult(validResponse);

      expect(result.aiFlag).toBe(false);
      expect(result.confidence).toBe('high');
      expect(result.categoriesFound).toEqual([]);
      expect(result.indicators).toEqual([]);
      expect(result.reasoning).toBe('No AI-generated patterns detected in the text');
    });
  });

  // -------------------------------------------------------------------------
  // Category 2: Missing Optional Fields (Should Use Defaults)
  // -------------------------------------------------------------------------

  describe('Missing Optional Fields', () => {
    it('should use default confidence if missing', () => {
      const response = JSON.stringify({
        aiFlag: true
        // confidence missing
      });

      const result = parseDetectionResult(response);

      expect(result.aiFlag).toBe(true);
      expect(result.confidence).toBe('medium'); // Default
      expect(result.categoriesFound).toEqual([]);
      expect(result.indicators).toEqual([]);
      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should handle missing categoriesFound array', () => {
      const response = JSON.stringify({
        aiFlag: true,
        confidence: 'low'
        // categoriesFound missing
      });

      const result = parseDetectionResult(response);

      expect(result.categoriesFound).toEqual([]);
    });

    it('should handle missing indicators array', () => {
      const response = JSON.stringify({
        aiFlag: false,
        confidence: 'high'
        // indicators missing
      });

      const result = parseDetectionResult(response);

      expect(result.indicators).toEqual([]);
    });

    it('should handle missing reasoning field', () => {
      const response = JSON.stringify({
        aiFlag: true
        // reasoning missing
      });

      const result = parseDetectionResult(response);

      expect(result.reasoning).toBe('No reasoning provided');
    });
  });

  // -------------------------------------------------------------------------
  // Category 3: Invalid Confidence Values
  // -------------------------------------------------------------------------

  describe('Confidence Level Validation', () => {
    it('should normalize uppercase confidence to lowercase', () => {
      const response = JSON.stringify({
        aiFlag: true,
        confidence: 'HIGH'
      });

      const result = parseDetectionResult(response);

      expect(result.confidence).toBe('high');
    });

    it('should normalize mixed case confidence', () => {
      const response = JSON.stringify({
        aiFlag: true,
        confidence: 'MeDiUm'
      });

      const result = parseDetectionResult(response);

      expect(result.confidence).toBe('medium');
    });

    it('should use default for invalid confidence value', () => {
      const response = JSON.stringify({
        aiFlag: true,
        confidence: 'very-high' // Invalid value
      });

      const result = parseDetectionResult(response);

      expect(result.confidence).toBe('medium'); // Default fallback
    });

    it('should accept all valid confidence levels', () => {
      ['low', 'medium', 'high'].forEach(level => {
        const response = JSON.stringify({
          aiFlag: true,
          confidence: level
        });

        const result = parseDetectionResult(response);

        expect(result.confidence).toBe(level);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Category 4: Array Validation and Filtering
  // -------------------------------------------------------------------------

  describe('Array Field Validation', () => {
    it('should filter out non-string categories', () => {
      const response = JSON.stringify({
        aiFlag: true,
        categoriesFound: [
          'Valid Category',
          123,              // Invalid: number
          'Another Valid',
          null,             // Invalid: null
          '',               // Invalid: empty
          'Third Valid'
        ]
      });

      const result = parseDetectionResult(response);

      expect(result.categoriesFound).toEqual([
        'Valid Category',
        'Another Valid',
        'Third Valid'
      ]);
    });

    it('should trim whitespace from categories', () => {
      const response = JSON.stringify({
        aiFlag: true,
        categoriesFound: [
          '  Bracketed Placeholders  ',
          'Markdown Artifacts\n',
          '\tIntroductory Remnants'
        ]
      });

      const result = parseDetectionResult(response);

      expect(result.categoriesFound).toEqual([
        'Bracketed Placeholders',
        'Markdown Artifacts',
        'Introductory Remnants'
      ]);
    });

    it('should filter out indicators without type field', () => {
      const response = JSON.stringify({
        aiFlag: true,
        indicators: [
          {
            type: 'Valid Indicator',
            snippet: 'Some text',
            explanation: 'Explanation'
          },
          {
            // Missing type
            snippet: 'Should be filtered',
            explanation: 'Explanation'
          },
          {
            type: 'Another Valid',
            snippet: 'Text',
            explanation: 'Reason'
          }
        ]
      });

      const result = parseDetectionResult(response);

      expect(result.indicators).toHaveLength(2);
      expect(result.indicators[0].type).toBe('Valid Indicator');
      expect(result.indicators[1].type).toBe('Another Valid');
    });

    it('should provide empty strings for missing snippet/explanation', () => {
      const response = JSON.stringify({
        aiFlag: true,
        indicators: [
          {
            type: 'Test Indicator'
            // snippet and explanation missing
          }
        ]
      });

      const result = parseDetectionResult(response);

      expect(result.indicators).toHaveLength(1);
      expect(result.indicators[0].type).toBe('Test Indicator');
      expect(result.indicators[0].snippet).toBe('');
      expect(result.indicators[0].explanation).toBe('');
    });

    it('should handle non-array categoriesFound gracefully', () => {
      const response = JSON.stringify({
        aiFlag: true,
        categoriesFound: 'not an array' // Wrong type
      });

      const result = parseDetectionResult(response);

      expect(result.categoriesFound).toEqual([]);
    });

    it('should handle non-array indicators gracefully', () => {
      const response = JSON.stringify({
        aiFlag: true,
        indicators: { not: 'an array' } // Wrong type
      });

      const result = parseDetectionResult(response);

      expect(result.indicators).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Category 5: Invalid JSON and Missing Required Fields
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should throw error for invalid JSON', () => {
      const invalidJSON = 'This is not JSON at all';

      expect(() => {
        parseDetectionResult(invalidJSON);
      }).toThrow(/Failed to parse OpenAI response as JSON/);
    });

    it('should throw error for malformed JSON', () => {
      const malformedJSON = '{"aiFlag": true, missing closing brace';

      expect(() => {
        parseDetectionResult(malformedJSON);
      }).toThrow(/Failed to parse OpenAI response as JSON/);
    });

    it('should throw error for missing aiFlag field', () => {
      const response = JSON.stringify({
        confidence: 'high',
        categoriesFound: []
        // aiFlag missing
      });

      expect(() => {
        parseDetectionResult(response);
      }).toThrow(/missing or invalid 'aiFlag' field/);
    });

    it('should throw error for non-boolean aiFlag', () => {
      const response = JSON.stringify({
        aiFlag: 'yes' // Should be boolean, not string
      });

      expect(() => {
        parseDetectionResult(response);
      }).toThrow(/missing or invalid 'aiFlag' field/);
    });

    it('should throw error for null aiFlag', () => {
      const response = JSON.stringify({
        aiFlag: null
      });

      expect(() => {
        parseDetectionResult(response);
      }).toThrow(/missing or invalid 'aiFlag' field/);
    });
  });

  // -------------------------------------------------------------------------
  // Category 6: Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty JSON object (only aiFlag required)', () => {
      const response = JSON.stringify({
        aiFlag: false
      });

      const result = parseDetectionResult(response);

      expect(result.aiFlag).toBe(false);
      expect(result.confidence).toBe('medium');
      expect(result.categoriesFound).toEqual([]);
      expect(result.indicators).toEqual([]);
      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should handle empty strings in reasoning', () => {
      const response = JSON.stringify({
        aiFlag: true,
        reasoning: '   ' // Only whitespace
      });

      const result = parseDetectionResult(response);

      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should handle very long reasoning text', () => {
      const longReasoning = 'A'.repeat(5000);
      const response = JSON.stringify({
        aiFlag: true,
        reasoning: longReasoning
      });

      const result = parseDetectionResult(response);

      expect(result.reasoning).toBe(longReasoning);
      expect(result.reasoning.length).toBe(5000);
    });

    it('should handle special characters in text fields', () => {
      const response = JSON.stringify({
        aiFlag: true,
        categoriesFound: ['Category with "quotes"', 'Category with \\backslash'],
        indicators: [
          {
            type: 'Test',
            snippet: '<script>alert("xss")</script>',
            explanation: 'Contains & ampersand, < less than, > greater than'
          }
        ]
      });

      const result = parseDetectionResult(response);

      expect(result.categoriesFound[0]).toBe('Category with "quotes"');
      expect(result.indicators[0].snippet).toBe('<script>alert("xss")</script>');
    });
  });
});

// ---------------------------------------------------------------------------
// Test Suite: createErrorResult()
// ---------------------------------------------------------------------------

describe('createErrorResult', () => {
  it('should create a safe fallback result for errors', () => {
    const errorMessage = 'OpenAI API timeout';

    const result = createErrorResult(errorMessage);

    expect(result.aiFlag).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.categoriesFound).toEqual([]);
    expect(result.indicators).toEqual([]);
    expect(result.reasoning).toContain('Error during analysis');
    expect(result.reasoning).toContain(errorMessage);
  });

  it('should include custom error message in reasoning', () => {
    const customError = 'Network connection failed';

    const result = createErrorResult(customError);

    expect(result.reasoning).toBe(`Error during analysis: ${customError}`);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: isValidDetectionResult()
// ---------------------------------------------------------------------------

describe('isValidDetectionResult', () => {
  it('should return true for valid DetectionResult', () => {
    const validResult: DetectionResult = {
      aiFlag: true,
      confidence: 'high',
      categoriesFound: ['Test Category'],
      indicators: [
        {
          type: 'Test',
          snippet: 'Test snippet',
          explanation: 'Test explanation'
        }
      ],
      reasoning: 'Test reasoning'
    };

    expect(isValidDetectionResult(validResult)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isValidDetectionResult(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isValidDetectionResult(undefined)).toBe(false);
  });

  it('should return false for non-object types', () => {
    expect(isValidDetectionResult('string')).toBe(false);
    expect(isValidDetectionResult(123)).toBe(false);
    expect(isValidDetectionResult(true)).toBe(false);
  });

  it('should return false for missing aiFlag', () => {
    const invalid = {
      // aiFlag missing
      confidence: 'high',
      categoriesFound: [],
      indicators: [],
      reasoning: 'Test'
    };

    expect(isValidDetectionResult(invalid)).toBe(false);
  });

  it('should return false for invalid confidence', () => {
    const invalid = {
      aiFlag: true,
      confidence: 'very-high', // Invalid value
      categoriesFound: [],
      indicators: [],
      reasoning: 'Test'
    };

    expect(isValidDetectionResult(invalid)).toBe(false);
  });

  it('should return false for non-array categoriesFound', () => {
    const invalid = {
      aiFlag: true,
      confidence: 'high',
      categoriesFound: 'not an array',
      indicators: [],
      reasoning: 'Test'
    };

    expect(isValidDetectionResult(invalid)).toBe(false);
  });

  it('should return false for non-array indicators', () => {
    const invalid = {
      aiFlag: true,
      confidence: 'high',
      categoriesFound: [],
      indicators: 'not an array',
      reasoning: 'Test'
    };

    expect(isValidDetectionResult(invalid)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: createNotificationMessage()
// ---------------------------------------------------------------------------

describe('createNotificationMessage', () => {
  it('should create message for detected AI content', () => {
    const result: DetectionResult = {
      aiFlag: true,
      confidence: 'high',
      categoriesFound: ['Introductory Remnants', 'Bracketed Placeholders'],
      indicators: [
        {
          type: 'Introductory Remnants',
          snippet: 'Sure, here is your email:',
          explanation: 'Test'
        },
        {
          type: 'Bracketed Placeholders',
          snippet: '[Your Name]',
          explanation: 'Test'
        }
      ],
      reasoning: 'Multiple artifacts detected'
    };

    const message = createNotificationMessage(result);

    expect(message).toContain('Possible AI-generated content detected');
    expect(message).toContain('high confidence');
    expect(message).toContain('Introductory Remnants, Bracketed Placeholders');
    expect(message).toContain('2 specific indicators identified');
    expect(message).toContain('Multiple artifacts detected');
  });

  it('should create message for clean content', () => {
    const result: DetectionResult = {
      aiFlag: false,
      confidence: 'high',
      categoriesFound: [],
      indicators: [],
      reasoning: 'No patterns detected'
    };

    const message = createNotificationMessage(result);

    expect(message).toBe('No AI-generated patterns detected.');
  });

  it('should handle single indicator (singular form)', () => {
    const result: DetectionResult = {
      aiFlag: true,
      confidence: 'medium',
      categoriesFound: ['Test Category'],
      indicators: [
        {
          type: 'Test',
          snippet: 'Test',
          explanation: 'Test'
        }
      ],
      reasoning: 'One indicator found'
    };

    const message = createNotificationMessage(result);

    expect(message).toContain('1 specific indicator identified');
    expect(message).not.toContain('indicators'); // Singular, not plural
  });

  it('should truncate very long reasoning', () => {
    const longReasoning = 'A'.repeat(300);
    const result: DetectionResult = {
      aiFlag: true,
      confidence: 'low',
      categoriesFound: [],
      indicators: [],
      reasoning: longReasoning
    };

    const message = createNotificationMessage(result);

    expect(message.length).toBeLessThan(longReasoning.length + 100);
    expect(message).toContain('...');
  });

  it('should not include default reasoning text', () => {
    const result: DetectionResult = {
      aiFlag: true,
      confidence: 'medium',
      categoriesFound: ['Test'],
      indicators: [],
      reasoning: 'No reasoning provided' // Default text
    };

    const message = createNotificationMessage(result);

    expect(message).not.toContain('No reasoning provided');
  });
});

// ---------------------------------------------------------------------------
// Test Suite: isValidConfidence()
// ---------------------------------------------------------------------------

describe('isValidConfidence', () => {
  it('should return true for valid confidence levels', () => {
    expect(isValidConfidence('low')).toBe(true);
    expect(isValidConfidence('medium')).toBe(true);
    expect(isValidConfidence('high')).toBe(true);
  });

  it('should return false for invalid confidence values', () => {
    expect(isValidConfidence('very-high')).toBe(false);
    expect(isValidConfidence('LOW')).toBe(false); // Case sensitive
    expect(isValidConfidence('')).toBe(false);
    expect(isValidConfidence(null)).toBe(false);
    expect(isValidConfidence(undefined)).toBe(false);
    expect(isValidConfidence(123)).toBe(false);
    expect(isValidConfidence({})).toBe(false);
  });
});

// ============================================================================
// End of Tests
// ============================================================================

