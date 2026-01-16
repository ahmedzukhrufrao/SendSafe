// ============================================================================
// Configuration Module
// ============================================================================
// This file reads all settings from environment variables and provides them
// to the rest of the application in a type-safe, organized way.
//
// WHAT ARE ENVIRONMENT VARIABLES?
// Environment variables are like settings that live outside your code.
// They're different on each computer/server, which lets you:
// - Keep secrets out of your code (so they don't get shared accidentally)
// - Use different settings for development vs production
// - Change settings without editing code
//
// HOW TO ACCESS THEM:
// In Node.js, environment variables are in the `process.env` object.
// Example: process.env.OPENAI_API_KEY reads the OPENAI_API_KEY variable
// ============================================================================

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------
// TypeScript "interfaces" define the shape of an object.
// Think of them like a contract: "This object MUST have these fields with these types"

/**
 * Configuration interface defines all settings our backend needs
 * Each property has a type (string, number, etc.) which TypeScript will enforce
 */
export interface Config {
  // OpenAI settings
  openai: {
    apiKey: string;           // Secret key to access OpenAI API
    model: string;            // Which AI model to use (e.g., "gpt-4o-mini")
    timeout: number;          // How long to wait for response (milliseconds)
  };
  
  // Security settings
  security: {
    sharedSecret: string;     // Password extension must provide
  };
  
  // Rate limiting settings
  rateLimit: {
    maxRequests: number;      // Max requests per time window
    windowMinutes: number;    // Time window length (in minutes)
  };
  
  // Text processing settings
  textProcessing: {
    maxLength: number;        // Maximum characters to analyze
  };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Reads an environment variable and throws an error if it's missing
 * 
 * WHY THIS IS USEFUL:
 * It's better to crash immediately with a clear error message than to
 * run with missing configuration and fail mysteriously later.
 * 
 * @param key - The name of the environment variable (e.g., "OPENAI_API_KEY")
 * @returns The value of the environment variable
 * @throws Error if the variable is not set
 */
function getRequiredEnvVar(key: string): string {
  // process.env[key] looks up the environment variable by name
  // It returns undefined if the variable doesn't exist
  const value = process.env[key];
  
  // If value is undefined, null, or empty string, throw an error
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Please set this in your .env file (local) or Vercel dashboard (production)`
    );
  }
  
  return value;
}

/**
 * Reads an environment variable and converts it to a number
 * 
 * EXPLANATION:
 * Environment variables are always strings (text).
 * If we need a number, we must convert it using parseInt().
 * 
 * @param key - The name of the environment variable
 * @param defaultValue - What to use if the variable isn't set
 * @returns The numeric value
 */
function getEnvVarAsNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  
  // If variable doesn't exist, use the default value
  if (!value) {
    return defaultValue;
  }
  
  // parseInt() converts a string to an integer (whole number)
  // Example: parseInt("10") returns the number 10
  // The second parameter (10) means "base 10" (regular decimal numbers)
  const parsed = parseInt(value, 10);
  
  // isNaN() checks if something is "Not a Number"
  // If user sets variable to "abc", parseInt returns NaN
  if (isNaN(parsed)) {
    throw new Error(
      `Environment variable ${key} must be a valid number, got: ${value}`
    );
  }
  
  return parsed;
}

// ---------------------------------------------------------------------------
// Main Configuration Object
// ---------------------------------------------------------------------------

/**
 * The main configuration object that the entire backend uses
 * 
 * HOW THIS WORKS:
 * When this file is imported, this code runs immediately.
 * It reads all environment variables and creates one organized config object.
 * Other files import this and use it: import { config } from './config';
 */
export const config: Config = {
  // OpenAI configuration
  openai: {
    // API key is required - will throw error if missing
    apiKey: getRequiredEnvVar('OPENAI_API_KEY'),
    
    // Model defaults to gpt-4o-mini if not specified
    // The || operator means "use this if the left side is empty"
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    
    // Timeout defaults to 10 seconds (10000 milliseconds)
    timeout: getEnvVarAsNumber('OPENAI_TIMEOUT', 10000),
  },
  
  // Security configuration
  security: {
    // Shared secret is required for MVP approach
    sharedSecret: getRequiredEnvVar('SENDSAFE_SHARED_SECRET'),
  },
  
  // Rate limiting configuration
  rateLimit: {
    // Default: 10 requests per hour (60 minutes)
    maxRequests: getEnvVarAsNumber('RATE_LIMIT_MAX_REQUESTS', 10),
    windowMinutes: getEnvVarAsNumber('RATE_LIMIT_WINDOW_MINUTES', 60),
  },
  
  // Text processing configuration
  textProcessing: {
    // Default: 5000 characters (about 2-3 pages)
    maxLength: getEnvVarAsNumber('MAX_TEXT_LENGTH', 5000),
  },
};

// ---------------------------------------------------------------------------
// Validation on Startup
// ---------------------------------------------------------------------------

/**
 * Validates that the configuration makes sense
 * This runs immediately when the file is loaded
 * 
 * WHY VALIDATE?
 * Better to catch configuration errors on startup than during a user request
 */
function validateConfig(): void {
  // Check API key looks reasonable (starts with 'sk-')
  if (!config.openai.apiKey.startsWith('sk-')) {
    console.warn(
      'Warning: OPENAI_API_KEY does not start with "sk-". ' +
      'This might not be a valid OpenAI API key.'
    );
  }
  
  // Check timeout is reasonable (between 1 and 30 seconds)
  if (config.openai.timeout < 1000 || config.openai.timeout > 30000) {
    console.warn(
      `Warning: OPENAI_TIMEOUT is ${config.openai.timeout}ms. ` +
      `Recommended range: 1000-30000 (1-30 seconds)`
    );
  }
  
  // Check rate limit makes sense
  if (config.rateLimit.maxRequests < 1) {
    throw new Error('RATE_LIMIT_MAX_REQUESTS must be at least 1');
  }
  
  // Check shared secret is long enough (at least 32 characters for security)
  if (config.security.sharedSecret.length < 32) {
    console.warn(
      'Warning: SENDSAFE_SHARED_SECRET should be at least 32 characters for security. ' +
      `Current length: ${config.security.sharedSecret.length}`
    );
  }
  
  // Log successful configuration (but don't log secrets!)
  console.log('✅ Configuration loaded successfully');
  console.log(`   - OpenAI Model: ${config.openai.model}`);
  console.log(`   - OpenAI Timeout: ${config.openai.timeout}ms`);
  console.log(`   - Rate Limit: ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMinutes} minutes`);
  console.log(`   - Max Text Length: ${config.textProcessing.maxLength} characters`);
}

// Run validation immediately
validateConfig();

// ---------------------------------------------------------------------------
// Export for Testing
// ---------------------------------------------------------------------------

/**
 * Export helper functions for testing purposes
 * This lets us write tests that verify the config logic works correctly
 */
export const configHelpers = {
  getRequiredEnvVar,
  getEnvVarAsNumber,
};

