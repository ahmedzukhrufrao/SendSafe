// ============================================================================
// Background Service Worker
// ============================================================================
// This is the "brain" of the extension that runs in the background.
//
// WHAT THIS SCRIPT DOES:
// 1. Receives messages from content script (when user pastes)
// 2. Calls the backend API to check for AI traces
// 3. Sends results back to content script to display in-page modal alert
// 4. Handles errors and edge cases
//
// SERVICE WORKER vs BACKGROUND PAGE:
// - Manifest V3 uses service workers (event-driven, can sleep)
// - Manifest V2 used background pages (always running)
// - Service workers wake up when needed, then sleep to save resources
//
// ALERT FLOW (Updated):
// - Previously: Background → chrome.notifications → OS notification center
// - Now: Background → chrome.tabs.sendMessage → Content script → In-page modal
// - This gives us full control over the alert's appearance and behavior
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
 * Response we send back to content script (for the original message acknowledgment)
 */
interface MessageResponse {
  success: boolean;
  error?: string;
}

/**
 * Message sent TO content script to show the in-page alert modal
 * 
 * This is a NEW message type that tells the content script to display
 * our custom dark-themed modal instead of using OS notifications.
 * 
 * Why we do this:
 * - OS notifications have limited styling (can't customize colors, fonts, layout)
 * - In-page modals give us full control over appearance
 * - Better user experience - alert appears right where the user is working
 */
interface ShowAlertMessage {
  type: 'SHOW_ALERT';           // Message type identifier
  alertType: 'warning' | 'error' | 'success'; // What kind of alert to show
  result?: APISuccessResponse;   // Detection result (for warning alerts)
  errorMessage?: string;         // Error message (for error alerts)
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
      
      // -----------------------------------------------------------------------
      // Get the tab ID from the sender
      // -----------------------------------------------------------------------
      // sender.tab contains information about the tab that sent the message
      // We need the tab ID to send the alert back to the correct tab
      // 
      // Why we need this:
      // - User might have multiple Gmail tabs open
      // - We need to show the alert in the same tab where they pasted
      // - chrome.tabs.sendMessage() requires a tab ID to know where to send
      const tabId = sender.tab?.id;
      
      // If we can't determine which tab sent the message, we can't show the alert
      // This shouldn't happen in normal use, but we handle it gracefully
      if (!tabId) {
        console.error('SendSafe: Could not determine sender tab ID');
        sendResponse({ success: false, error: 'Could not determine sender tab' });
        return true;
      }
      
      // Handle the paste asynchronously
      // We can't use async/await directly in the listener, so we
      // call an async function and handle the response
      // 
      // We pass tabId so the handler knows where to send the alert
      handlePasteDetection(message as PasteDetectedMessage, tabId)
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
 * Handles paste detection by calling backend API and sending alert to content script
 * 
 * FLOW:
 * 1. Call backend API with the pasted text
 * 2. If AI traces detected → Send SHOW_ALERT message to content script
 * 3. If no AI traces → Do nothing (per PRD requirement)
 * 4. If error → Send error alert to content script
 * 
 * @param message - The paste detection message from content script
 * @param tabId - The ID of the tab to send the alert to
 */
async function handlePasteDetection(message: PasteDetectedMessage, tabId: number): Promise<void> {
  // -------------------------------------------------------------------------
  // PERFORMANCE TIMING: Track total time for the entire flow
  // -------------------------------------------------------------------------
  const totalStartTime = performance.now();
  console.log(`SendSafe: ⏱️ [TIMING] Starting analysis of ${message.text.length} characters`);
  
  try {
    // -----------------------------------------------------------------------
    // Step 1: Call backend API
    // -----------------------------------------------------------------------
    const apiStartTime = performance.now();
    const result = await callBackendAPI(message.text);
    const apiEndTime = performance.now();
    
    console.log(`SendSafe: ⏱️ [TIMING] Backend API call took ${(apiEndTime - apiStartTime).toFixed(0)}ms`);
    
    // -----------------------------------------------------------------------
    // Step 2: Send alert to content script based on result
    // -----------------------------------------------------------------------
    if (result.aiFlag) {
      // AI traces detected - send warning alert to content script
      // The content script will display the in-page modal
      const alertStartTime = performance.now();
      await sendAlertToContentScript(tabId, 'warning', result);
      const alertEndTime = performance.now();
      
      console.log(`SendSafe: ⏱️ [TIMING] Sending alert to content script took ${(alertEndTime - alertStartTime).toFixed(0)}ms`);
    } else {
      // No AI traces - send success alert to content script
      // The content script will display the success toaster
      const alertStartTime = performance.now();
      await sendAlertToContentScript(tabId, 'success', result);
      const alertEndTime = performance.now();
      
      console.log(`SendSafe: ⏱️ [TIMING] Sending success alert to content script took ${(alertEndTime - alertStartTime).toFixed(0)}ms`);
    }
    
    // Log total time
    const totalEndTime = performance.now();
    console.log(`SendSafe: ⏱️ [TIMING] TOTAL processing time: ${(totalEndTime - totalStartTime).toFixed(0)}ms`);
    
  } catch (error) {
    // -----------------------------------------------------------------------
    // Step 3: Handle errors by sending error alert
    // -----------------------------------------------------------------------
    const totalEndTime = performance.now();
    console.error('SendSafe: Error during analysis:', error);
    console.log(`SendSafe: ⏱️ [TIMING] Error occurred after ${(totalEndTime - totalStartTime).toFixed(0)}ms`);
    
    // Extract error message for display
    // We show user-friendly messages, not technical details
    let errorMessage = 'An error occurred while checking the text.';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check if this is a network error and provide user-friendly message
      const isNetworkError = 
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('timeout') ||
        error.message.includes('Network request failed') ||
        error.message.toLowerCase().includes('network');
      
      if (isNetworkError) {
        errorMessage = 'Network error. We are unable to read your pasted text. Please try again later.';
      }
    }
    
    await sendAlertToContentScript(tabId, 'error', undefined, errorMessage);
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
// Alert Communication Functions
// ---------------------------------------------------------------------------
// Instead of using Chrome's system notifications, we now send messages back
// to the content script which displays a custom in-page modal.
//
// WHY THIS CHANGE:
// - System notifications appear in OS notification center (limited styling)
// - In-page modals appear directly in Gmail (full styling control)
// - Better UX: alert is right where the user is working
// - Dark theme with orange accent matches modern design
// ---------------------------------------------------------------------------

/**
 * Sends an alert message to the content script to display the in-page modal
 * 
 * This function uses chrome.tabs.sendMessage() to communicate with the
 * content script running in the specified tab. The content script will
 * receive this message and display the appropriate modal.
 * 
 * HOW IT WORKS:
 * 1. Background script calls this function with alert details
 * 2. chrome.tabs.sendMessage() sends message to the specific tab
 * 3. Content script's message listener receives the message
 * 4. Content script creates and displays the modal
 * 
 * @param tabId - The ID of the tab to send the alert to
 * @param alertType - 'warning' for AI traces detected, 'error' for errors, 'success' for no AI detected
 * @param result - The detection result (only for warning and success alerts)
 * @param errorMessage - The error message (only for error alerts)
 */
async function sendAlertToContentScript(
  tabId: number,
  alertType: 'warning' | 'error' | 'success',
  result?: APISuccessResponse,
  errorMessage?: string
): Promise<void> {
  console.log(`SendSafe: Sending ${alertType} alert to tab ${tabId}`);
  
  // -------------------------------------------------------------------------
  // Build the message to send to content script
  // -------------------------------------------------------------------------
  // The ShowAlertMessage interface defines what data we send
  // Content script will use this data to build the modal
  
  const alertMessage: ShowAlertMessage = {
    type: 'SHOW_ALERT',      // Message type identifier (content script checks this)
    alertType: alertType,     // 'warning' or 'error'
    result: result,           // Detection result (undefined for errors)
    errorMessage: errorMessage, // Error message (undefined for warnings)
  };
  
  // -------------------------------------------------------------------------
  // Send message to the content script
  // -------------------------------------------------------------------------
  // chrome.tabs.sendMessage() is different from chrome.runtime.sendMessage():
  // - chrome.runtime.sendMessage() → Sends to background script
  // - chrome.tabs.sendMessage() → Sends to content script in specific tab
  //
  // We need the tab ID to know which Gmail tab should show the alert
  // (user might have multiple Gmail tabs open)
  
  try {
    await chrome.tabs.sendMessage(tabId, alertMessage);
    console.log('SendSafe: Alert message sent successfully');
  } catch (error) {
    // If sending fails (e.g., tab was closed), log the error
    // We don't want to crash the extension if the tab is gone
    console.error('SendSafe: Failed to send alert to content script:', error);
  }
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
 * 4. When PASTE_DETECTED message arrives:
 *    a. Validates message type
 *    b. Extracts sender tab ID
 *    c. Calls backend API
 *    d. Parses response
 *    e. Sends SHOW_ALERT message back to content script
 *    f. Content script displays in-page modal
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
 * chrome.tabs.sendMessage
 * - Sends messages TO content scripts in specific tabs
 * - Used to tell content script to show the in-page modal
 * - Requires tab ID to know which tab to send to
 * 
 * chrome.runtime.onInstalled
 * - Runs when extension is installed/updated
 * - Good for one-time setup tasks
 * 
 * chrome.runtime.onStartup
 * - Runs when browser starts
 * - Good for initialization tasks
 * 
 * NOTE: We no longer use chrome.notifications for alerts.
 * Instead, we send messages to content script which displays
 * a custom in-page modal. This gives us full styling control.
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
 *    → Send error alert to content script
 * 
 * 2. Authentication Errors (401/403)
 *    - Wrong shared secret
 *    - Missing authentication
 *    → Send error alert about configuration
 * 
 * 3. Rate Limit Errors (429)
 *    - Too many requests
 *    → Send error alert with wait time
 * 
 * 4. Server Errors (500)
 *    - Backend crashed
 *    - OpenAI API down
 *    → Send error alert to try again later
 * 
 * 5. Parsing Errors
 *    - Invalid JSON response
 *    - Unexpected response format
 *    → Send generic error alert
 * 
 * 6. Tab Communication Errors
 *    - Tab was closed before alert could be sent
 *    - Content script not loaded
 *    → Log error, fail gracefully
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
 *    - "Sending warning alert to tab X" = Alert being sent
 *    - "Alert message sent successfully" = Content script received it
 *    - "Failed to send alert" = Tab closed or content script not loaded
 * 
 * 3. Check for errors in red
 * 
 * 4. Test scenarios:
 *    - Paste with AI text (should show in-page modal)
 *    - Paste with human text (should show nothing)
 *    - Paste with backend down (should show error modal)
 *    - Paste many times quickly (should hit rate limit)
 * 
 * 5. Network tab:
 *    - See actual API requests
 *    - Check request headers (auth secret)
 *    - Check response status codes
 *    - Check response bodies
 * 
 * 6. Gmail page console (for modal debugging):
 *    - Open DevTools on Gmail tab
 *    - Look for "SendSafe:" messages from content script
 *    - Check if modal HTML is being injected
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

