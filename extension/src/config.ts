// ============================================================================
// Extension Configuration
// ============================================================================
// This file contains all configurable settings for the SendSafe extension.
//
// WHAT THIS FILE DOES:
// - Defines the backend API URL
// - Sets timeouts and limits
// - Configures the shared secret for MVP authentication
//
// NOTE: These values are visible to users (extension code is public).
// Never put truly sensitive secrets here in production.
// ============================================================================

/**
 * Configuration object for the SendSafe extension
 * 
 * All settings that control extension behavior are centralized here
 * for easy modification and maintenance.
 */
export const config = {
  // -------------------------------------------------------------------------
  // Backend API Configuration
  // -------------------------------------------------------------------------
  
  /**
   * The URL of the backend API endpoint
   * 
   * FOR LOCAL DEVELOPMENT: Use http://localhost:3000/api/check-ai-traces
   * FOR PRODUCTION: Use your Vercel deployment URL
   * 
   * Example production URL: https://sendsafe.vercel.app/api/check-ai-traces
   */
  api: {
    // The endpoint to call for AI detection
    url: 'http://localhost:3000/api/check-ai-traces',
    
    // How long to wait for the API response before giving up (milliseconds)
    // 15 seconds = 15000 milliseconds
    timeoutMs: 15000,
  },
  
  // -------------------------------------------------------------------------
  // Authentication Configuration (MVP Approach)
  // -------------------------------------------------------------------------
  
  /**
   * Shared secret for MVP authentication
   * 
   * WARNING: This is NOT secure for production!
   * Anyone can inspect the extension code and see this value.
   * 
   * For MVP, it provides basic protection:
   * - Stops casual abuse
   * - Prevents accidental API calls
   * - Better than nothing
   * 
   * For production, implement proper user authentication:
   * - User accounts with API keys
   * - OAuth tokens
   * - JWT authentication
   */
  auth: {
    // The header name to send the secret in
    headerName: 'X-SendSafe-Secret',
    
    // The secret value (must match SENDSAFE_SHARED_SECRET on backend)
    // This is an MVP approach - visible to users but provides basic protection
    sharedSecret: 'sendsafe-mvp-2024-a8f3k9m2p7x4w1q6',
  },
  
  // -------------------------------------------------------------------------
  // Text Processing Configuration
  // -------------------------------------------------------------------------
  
  /**
   * Limits on text that can be analyzed
   */
  text: {
    // Maximum length of text to send to backend (characters)
    // Matches backend limit of 5000 characters
    maxLength: 5000,
    
    // Minimum length worth analyzing (avoid empty/trivial pastes)
    minLength: 10,
  },
  
  // -------------------------------------------------------------------------
  // UI Behavior Configuration
  // -------------------------------------------------------------------------
  
  /**
   * How notifications behave
   */
  notifications: {
    // How long notification stays visible (milliseconds)
    // 0 = stays until user dismisses
    // 10000 = 10 seconds (as per PRD FR-4.6)
    durationMs: 10000,
    
    // Icon to show in notifications
    iconPath: 'assets/icons/icon-128.png',
  },
  
  // -------------------------------------------------------------------------
  // Gmail Detection Configuration
  // -------------------------------------------------------------------------
  
  /**
   * CSS selectors to find Gmail's compose boxes
   * 
   * Gmail's UI changes frequently, so we use multiple selectors
   * as fallbacks. The extension tries each one until it finds a match.
   * 
   * These selectors target the contenteditable div where users type emails.
   */
  gmail: {
    // Array of selectors to try (in order)
    composeSelectors: [
      // Main compose window
      'div[aria-label="Message Body"]',
      'div[g_editable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      
      // Reply/forward boxes
      'div.editable[contenteditable="true"]',
      
      // Pop-out compose window
      'div[aria-label="Message body"][contenteditable="true"]',
    ],
    
    // How often to check for new compose boxes (milliseconds)
    // Gmail creates compose boxes dynamically, so we watch for them
    checkIntervalMs: 1000,
  },
  
  // -------------------------------------------------------------------------
  // Rate Limiting (Client-Side)
  // -------------------------------------------------------------------------
  
  /**
   * Prevent spamming the backend with rapid paste events
   * 
   * If user pastes multiple times quickly, we don't want to
   * send 10 API requests in 1 second. This adds a cooldown.
   */
  rateLimiting: {
    // Minimum time between checks (milliseconds)
    // If user pastes again within this time, ignore it
    minTimeBetweenChecksMs: 2000, // 2 seconds
  },
};

// -------------------------------------------------------------------------
// Type Definitions for Type Safety
// -------------------------------------------------------------------------

/**
 * Type definition for the config object
 * This helps TypeScript catch errors if we misuse the config
 */
export type Config = typeof config;

// -------------------------------------------------------------------------
// Validation on Load
// -------------------------------------------------------------------------

/**
 * Validates that required config values are set
 * Throws error if configuration is invalid
 * 
 * This helps catch configuration errors early, before the extension
 * tries to use them.
 */
export function validateConfig(): void {
  // Check API URL is set
  if (!config.api.url || config.api.url.includes('your-domain')) {
    console.warn(
      'SendSafe: Backend URL not configured. ' +
      'Please update config.api.url in src/config.ts'
    );
  }
  
  // Check shared secret is set
  if (!config.auth.sharedSecret || config.auth.sharedSecret === 'your-shared-secret-here') {
    console.warn(
      'SendSafe: Shared secret not configured. ' +
      'Please update config.auth.sharedSecret in src/config.ts'
    );
  }
  
  // Check timeout is reasonable
  if (config.api.timeoutMs < 5000) {
    console.warn(
      'SendSafe: API timeout is very short. ' +
      'Consider increasing config.api.timeoutMs'
    );
  }
}

// Run validation when config is loaded
// This will log warnings in the console if config is invalid
validateConfig();

// -------------------------------------------------------------------------
// Documentation Notes
// -------------------------------------------------------------------------

/**
 * HOW TO UPDATE FOR PRODUCTION:
 * 
 * 1. Deploy backend to Vercel (Task 7.0)
 * 2. Get your production URL (e.g., https://sendsafe.vercel.app)
 * 3. Update config.api.url to point to: https://sendsafe.vercel.app/api/check-ai-traces
 * 4. Update config.auth.sharedSecret to match your Vercel environment variable
 * 5. Test the extension to confirm it connects to production backend
 * 
 * SECURITY NOTE:
 * The shared secret visible in this file is an MVP compromise.
 * For a production app with many users, implement proper authentication:
 * - User accounts
 * - API keys per user
 * - OAuth or JWT tokens
 * - Server-side rate limiting per user (not just per IP)
 */

