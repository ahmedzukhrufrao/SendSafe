// ============================================================================
// Background Service Worker
// ============================================================================
// This is the "brain" of the extension that runs in the background.
//
// WHAT THIS SCRIPT DOES:
// 1. Receives messages from content script (when user pastes)
// 2. Calls the backend API to check for AI traces
// 3. Shows Chrome notifications with results
// 4. Handles errors and edge cases
//
// SERVICE WORKER vs BACKGROUND PAGE:
// - Manifest V3 uses service workers (event-driven, can sleep)
// - Manifest V2 used background pages (always running)
// - Service workers wake up when needed, then sleep to save resources
// ============================================================================

import { config } from './config';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Message received from content script
 */
interface PasteDetectedMessage {
  type: 'PASTE_DETECTED';
  text: string;
  timestamp: number;
}

/**
 * Response we send back to content script
 */
interface MessageResponse {
  success: boolean;
  error?: string;
}

/**
 * Backend API success response structure
 */
interface APISuccessResponse {
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
 * Backend API error response structure
 */
interface APIErrorResponse {
  error: string;
  code?: string;
  retryAfter?: number;
}

// ---------------------------------------------------------------------------
// Message Listener
// ---------------------------------------------------------------------------

/**
 * Listens for messages from content script
 * 
 * chrome.runtime.onMessage is an event that fires when any part
 * of the extension sends a message using chrome.runtime.sendMessage()
 * 
 * The listener receives:
 * - message: The data sent by the sender
 * - sender: Information about who sent the message
 * - sendResponse: Function to send a response back
 * 
 * IMPORTANT: Return true to indicate we'll send response asynchronously
 */
chrome.runtime.onMessage.addListener(
  (
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean => {
    // Check if this is a paste detection message
    if (message.type === 'PASTE_DETECTED') {
      console.log('SendSafe: Received paste detection message');
      
      // Handle the paste asynchronously
      // We can't use async/await directly in the listener, so we
      // call an async function and handle the response
      handlePasteDetection(message as PasteDetectedMessage)
        .then(() => {
          // Success - send positive response
          sendResponse({ success: true });
        })
        .catch((error) => {
          // Error - send error response
          console.error('SendSafe: Error handling paste:', error);
          sendResponse({ 
            success: false, 
            error: error.message || 'Unknown error' 
          });
        });
      
      // Return true to indicate we'll call sendResponse asynchronously
      // If we don't return true, the message channel closes immediately
      return true;
    }
    
    // Unknown message type - ignore it
    return false;
  }
);

// ---------------------------------------------------------------------------
// Main Handler Function
// ---------------------------------------------------------------------------

/**
 * Handles paste detection by calling backend API and showing notifications
 * 
 * @param message - The paste detection message from content script
 */
async function handlePasteDetection(message: PasteDetectedMessage): Promise<void> {
  console.log(`SendSafe: Analyzing ${message.text.length} characters`);
  
  try {
    // -----------------------------------------------------------------------
    // Step 1: Call backend API
    // -----------------------------------------------------------------------
    const result = await callBackendAPI(message.text);
    
    // -----------------------------------------------------------------------
    // Step 2: Show notification based on result
    // -----------------------------------------------------------------------
    if (result.aiFlag) {
      // AI traces detected - show warning
      await showWarningNotification(result);
    } else {
      // No AI traces - show nothing (per PRD requirement)
      console.log('SendSafe: No AI traces detected, no notification shown');
    }
    
  } catch (error) {
    // -----------------------------------------------------------------------
    // Step 3: Handle errors
    // -----------------------------------------------------------------------
    console.error('SendSafe: Error during analysis:', error);
    await showErrorNotification(error);
  }
}

// ---------------------------------------------------------------------------
// Backend API Communication
// ---------------------------------------------------------------------------

/**
 * Calls the backend API to analyze text
 * 
 * @param text - The text to analyze
 * @returns The detection result from the backend
 * @throws Error if API call fails
 */
async function callBackendAPI(text: string): Promise<APISuccessResponse> {
  console.log(`SendSafe: Calling backend API: ${config.api.url}`);
  
  // -------------------------------------------------------------------------
  // Prepare the request
  // -------------------------------------------------------------------------
  
  // Create request body
  const requestBody = {
    text: text,
  };
  
  // Create request headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Add authentication header with shared secret
    [config.auth.headerName]: config.auth.sharedSecret,
  };
  
  // -------------------------------------------------------------------------
  // Create timeout promise
  // -------------------------------------------------------------------------
  // We race the fetch against a timeout to prevent waiting forever
  
  /**
   * Creates a promise that rejects after a timeout
   * 
   * This is used with Promise.race() to implement request timeout.
   * If the API doesn't respond within timeoutMs, we give up.
   */
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timeout after ${config.api.timeoutMs}ms`));
    }, config.api.timeoutMs);
  });
  
  // -------------------------------------------------------------------------
  // Make the API request
  // -------------------------------------------------------------------------
  
  try {
    // fetch() is the browser API for making HTTP requests
    // It returns a Promise that resolves with the response
    const fetchPromise = fetch(config.api.url, {
      method: 'POST',           // HTTP method (sending data)
      headers: headers,         // Request headers
      body: JSON.stringify(requestBody),  // Convert object to JSON string
    });
    
    // Race fetch against timeout
    // Promise.race returns whichever promise resolves/rejects first
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    // -----------------------------------------------------------------------
    // Parse the response
    // -----------------------------------------------------------------------
    
    // Check if request was successful (status 200-299)
    if (!response.ok) {
      // Request failed - parse error response
      const errorData = await response.json() as APIErrorResponse;
      
      // Create descriptive error message based on status code
      let errorMessage = errorData.error || 'Unknown error';
      
      // Add specific handling for common error codes
      if (response.status === 429) {
        // Rate limit exceeded
        const retryAfter = errorData.retryAfter || 60;
        errorMessage = `Rate limit exceeded. Please wait ${retryAfter} seconds.`;
      } else if (response.status === 401 || response.status === 403) {
        // Authentication failed
        errorMessage = 'Authentication failed. Please check extension configuration.';
      } else if (response.status === 500) {
        // Server error
        errorMessage = 'Server error. Please try again later.';
      }
      
      throw new Error(errorMessage);
    }
    
    // Parse success response
    const data = await response.json() as APISuccessResponse;
    
    console.log('SendSafe: API response received:', {
      aiFlag: data.aiFlag,
      confidence: data.confidence,
      categoriesCount: data.categoriesFound.length,
    });
    
    return data;
    
  } catch (error) {
    // Handle network errors, timeout, or parsing errors
    if (error instanceof Error) {
      // Re-throw with more context
      throw new Error(`API call failed: ${error.message}`);
    } else {
      throw new Error('API call failed: Unknown error');
    }
  }
}

// ---------------------------------------------------------------------------
// Notification Functions
// ---------------------------------------------------------------------------

/**
 * Shows a warning notification when AI traces are detected
 * 
 * @param result - The detection result from the backend
 */
async function showWarningNotification(result: APISuccessResponse): Promise<void> {
  console.log('SendSafe: Showing warning notification');
  
  // -------------------------------------------------------------------------
  // Build notification message
  // -------------------------------------------------------------------------
  
  // Start with main warning
  let message = `AI copy-paste artifacts detected (${result.confidence} confidence)`;
  
  // Add categories if any found
  if (result.categoriesFound.length > 0) {
    message += `\n\nCategories: ${result.categoriesFound.join(', ')}`;
  }
  
  // Add indicator count
  if (result.indicators.length > 0) {
    message += `\n\n${result.indicators.length} indicator${result.indicators.length > 1 ? 's' : ''} found`;
  }
  
  // Add first indicator as example (if available)
  if (result.indicators.length > 0 && result.indicators[0].snippet) {
    const firstSnippet = result.indicators[0].snippet;
    // Truncate if too long
    const snippetPreview = firstSnippet.length > 50 
      ? firstSnippet.substring(0, 50) + '...'
      : firstSnippet;
    message += `\n\nExample: "${snippetPreview}"`;
  }
  
  // -------------------------------------------------------------------------
  // Create notification
  // -------------------------------------------------------------------------
  
  // chrome.notifications.create() shows a system notification
  // These appear in the system notification area (Windows Action Center, macOS Notification Center, etc.)
  await chrome.notifications.create({
    type: 'basic',                    // Notification type (basic = simple text)
    iconUrl: config.notifications.iconPath,  // Icon to show
    title: '⚠️ AI Traces Detected in Pasted Content',     // Notification title
    message: message,                 // Notification body text
    priority: 2,                      // Priority (0=lowest, 2=highest)
    requireInteraction: false,  // Auto-dismiss after ~10 seconds (PRD FR-4.6, DS-1)
  });
}

/**
 * Shows an error notification when something goes wrong
 * 
 * @param error - The error that occurred
 */
async function showErrorNotification(error: any): Promise<void> {
  console.log('SendSafe: Showing error notification');
  
  // Extract error message
  let errorMessage = 'An error occurred while checking the text.';
  
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  
  // Create notification
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: config.notifications.iconPath,
    title: '❌ SendSafe Error',
    message: errorMessage,
    priority: 1,
    requireInteraction: false,
  });
}

// ---------------------------------------------------------------------------
// Service Worker Lifecycle
// ---------------------------------------------------------------------------

/**
 * Runs when service worker is installed
 * 
 * This happens when:
 * - Extension is first installed
 * - Extension is updated to new version
 * - Extension is reloaded during development
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('SendSafe: Extension installed/updated', details.reason);
  
  // You could show a welcome notification here
  // Or perform one-time setup tasks
  
  if (details.reason === 'install') {
    console.log('SendSafe: First time installation');
  } else if (details.reason === 'update') {
    console.log('SendSafe: Extension updated');
  }
});

/**
 * Runs when service worker starts up
 * 
 * Service workers can be stopped by the browser to save resources,
 * then restarted when needed. This event fires on startup.
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('SendSafe: Service worker started');
});

// ---------------------------------------------------------------------------
// Documentation Comments
// ---------------------------------------------------------------------------

/**
 * BACKGROUND SCRIPT LIFECYCLE:
 * 
 * 1. Service worker starts (on extension load or when needed)
 * 2. Registers message listener
 * 3. Waits for messages from content script
 * 4. When message arrives:
 *    a. Validates message type
 *    b. Calls backend API
 *    c. Parses response
 *    d. Shows notification
 *    e. Sends response back to content script
 * 5. Service worker may sleep if idle for 30 seconds
 * 6. Wakes up when new message arrives
 * 
 * SERVICE WORKER LIMITATIONS:
 * - Can't use localStorage (use chrome.storage instead)
 * - Can't use DOM APIs (no document, window)
 * - Can be stopped/restarted at any time
 * - Must complete async work quickly or use chrome.alarms
 * 
 * For our use case, this is fine because:
 * - Each paste is independent
 * - API calls complete in seconds
 * - No persistent state needed between pastes
 */

/**
 * CHROME APIS USED:
 * 
 * chrome.runtime.onMessage
 * - Receives messages from content scripts
 * - Allows communication between different parts of extension
 * 
 * chrome.notifications
 * - Shows system notifications
 * - Requires "notifications" permission in manifest
 * 
 * chrome.runtime.onInstalled
 * - Runs when extension is installed/updated
 * - Good for one-time setup tasks
 * 
 * chrome.runtime.onStartup
 * - Runs when browser starts
 * - Good for initialization tasks
 */

/**
 * ERROR HANDLING STRATEGY:
 * 
 * We handle several types of errors:
 * 
 * 1. Network Errors
 *    - No internet connection
 *    - Backend server down
 *    - Timeout
 *    → Show error notification with retry suggestion
 * 
 * 2. Authentication Errors (401/403)
 *    - Wrong shared secret
 *    - Missing authentication
 *    → Show error notification about configuration
 * 
 * 3. Rate Limit Errors (429)
 *    - Too many requests
 *    → Show error notification with wait time
 * 
 * 4. Server Errors (500)
 *    - Backend crashed
 *    - OpenAI API down
 *    → Show error notification to try again later
 * 
 * 5. Parsing Errors
 *    - Invalid JSON response
 *    - Unexpected response format
 *    → Show generic error notification
 * 
 * All errors are logged to console for debugging.
 */

/**
 * DEBUGGING TIPS:
 * 
 * 1. Open extension's service worker console:
 *    - Go to chrome://extensions
 *    - Enable "Developer mode"
 *    - Click "Service worker" link under SendSafe
 * 
 * 2. Look for "SendSafe:" log messages
 * 
 * 3. Check for errors in red
 * 
 * 4. Test scenarios:
 *    - Paste with AI text (should show warning)
 *    - Paste with human text (should show nothing)
 *    - Paste with backend down (should show error)
 *    - Paste many times quickly (should hit rate limit)
 * 
 * 5. Network tab:
 *    - See actual API requests
 *    - Check request headers (auth secret)
 *    - Check response status codes
 *    - Check response bodies
 */

/**
 * SECURITY NOTES:
 * 
 * 1. Shared Secret Visibility
 *    - The shared secret in config.ts is visible to users
 *    - This is an MVP compromise for simplicity
 *    - For production, implement proper user authentication
 * 
 * 2. HTTPS Required
 *    - Production backend must use HTTPS
 *    - Prevents man-in-the-middle attacks
 *    - Chrome enforces this for extensions
 * 
 * 3. Content Security Policy
 *    - Service workers have strict CSP
 *    - Can't eval() or use inline scripts
 *    - Can't load external scripts
 *    - Our code complies with these restrictions
 * 
 * 4. Privacy
 *    - We send pasted text to backend
 *    - Backend doesn't store the text (per privacy policy)
 *    - Users should be informed via privacy policy
 */

