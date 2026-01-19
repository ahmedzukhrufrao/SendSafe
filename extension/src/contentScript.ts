// ============================================================================
// Content Script - Gmail Paste Detection & Alert Display
// ============================================================================
// This script runs inside Gmail pages and handles two main functions:
//
// FUNCTION 1: PASTE DETECTION
// 1. Finds Gmail's compose boxes (main compose, reply, forward, pop-out)
// 2. Listens for paste events on those boxes
// 3. Extracts the pasted text
// 4. Sends it to the background script for analysis
//
// FUNCTION 2: ALERT DISPLAY (NEW)
// 5. Receives SHOW_ALERT messages from background script
// 6. Creates and displays a dark-themed in-page modal
// 7. Shows AI trace detection results with details
// 8. Auto-dismisses after 10 seconds or on user interaction
//
// IMPORTANT: Content scripts run in the context of web pages, so they can
// access the DOM (page elements) but have limited access to Chrome APIs.
// That's why we send messages to the background script for API calls.
//
// WHY IN-PAGE MODALS?
// - Chrome's system notifications have limited styling options
// - In-page modals give us full control over appearance
// - Better UX: alert appears where the user is working
// - Can show detailed information about detected AI traces
// ============================================================================

import { config } from './config';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Message sent TO background script when paste is detected
 */
interface PasteDetectedMessage {
  type: 'PASTE_DETECTED';
  text: string;
  timestamp: number;
}

/**
 * Response from background script (acknowledgment of message received)
 */
interface BackgroundResponse {
  success: boolean;
  error?: string;
}

/**
 * Message received FROM background script to show an alert
 * 
 * This is the new message type that triggers the in-page modal display.
 * The background script sends this after analyzing the pasted text.
 */
interface ShowAlertMessage {
  type: 'SHOW_ALERT';              // Message type identifier
  alertType: 'warning' | 'error';  // What kind of alert to show
  result?: APISuccessResponse;     // Detection result (for warning alerts)
  errorMessage?: string;           // Error message (for error alerts)
}

/**
 * Backend API success response structure
 * 
 * This matches the response format from our backend API.
 * Contains all the details about AI trace detection.
 */
interface APISuccessResponse {
  aiFlag: boolean;                 // true if AI traces were detected
  confidence: 'low' | 'medium' | 'high';  // How confident the detection is
  categoriesFound: string[];       // Types of AI artifacts found
  indicators: Array<{              // Specific examples of AI traces
    type: string;                  // Category name
    snippet: string;               // Exact text from the email
    explanation: string;           // Why this is an AI artifact
  }>;
  reasoning: string;               // Overall explanation
}

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------

/**
 * Tracks compose boxes we're already monitoring
 * 
 * Why we need this:
 * - Gmail creates/destroys compose boxes dynamically
 * - We use MutationObserver to watch for new ones
 * - This Set prevents us from adding duplicate listeners
 * 
 * A Set is like an array but only stores unique values:
 * - set.add(element) - adds element (no duplicates)
 * - set.has(element) - checks if element exists
 * - set.delete(element) - removes element
 */
const monitoredElements = new Set<HTMLElement>();

/**
 * Timestamp of last paste check
 * 
 * Used for client-side rate limiting to prevent spamming
 * the backend if user pastes multiple times rapidly.
 * 
 * Date.now() returns milliseconds since January 1, 1970 (Unix epoch)
 */
let lastCheckTimestamp = 0;

/**
 * Timestamp of when the last paste was detected (for end-to-end timing)
 * This allows us to measure the full time from paste to modal display.
 */
let lastPasteStartTime = 0;

/**
 * Reference to the current modal element (if one is being displayed)
 * 
 * We track this so we can:
 * - Remove the old modal before showing a new one
 * - Access it for the dismiss function
 * - Know if a modal is currently visible
 * 
 * null means no modal is currently shown
 */
let currentModal: HTMLElement | null = null;

/**
 * Reference to the current floating status indicator element (if displayed)
 *
 * This appears immediately on paste to provide instant feedback while the
 * background + backend API work completes.
 */
let currentStatusIndicator: HTMLElement | null = null;

/**
 * Safety timeout for the status indicator (prevents it from sticking forever)
 */
let statusSafetyTimeout: number | null = null;

/**
 * Reference to the auto-dismiss timeout
 * 
 * We track this so we can:
 * - Cancel the timeout if user manually dismisses the modal
 * - Prevent multiple timeouts from stacking up
 * 
 * null means no timeout is currently active
 * 
 * NodeJS.Timeout is the type returned by setTimeout()
 * We use 'number' because in browsers, setTimeout returns a number
 */
let autoDismissTimeout: number | null = null;

/**
 * Auto-dismiss duration in milliseconds
 * 
 * The modal will automatically disappear after this time.
 * Set to 10 seconds to match the previous system notification behavior.
 * 
 * 10000ms = 10 seconds
 */
const AUTO_DISMISS_MS = config.modal.autoDismissMs;

/**
 * Maximum time we will keep the status indicator visible without receiving a final outcome.
 * This should be longer than the backend timeout to account for messaging overhead.
 */
const STATUS_SAFETY_TIMEOUT_MS = config.api.timeoutMs + 2000;

// ---------------------------------------------------------------------------
// Main Initialization
// ---------------------------------------------------------------------------

/**
 * Entry point - called when script loads
 * 
 * This function sets up everything needed for SendSafe:
 * 1. Finds existing compose boxes
 * 2. Watches for new compose boxes
 * 3. Attaches paste listeners
 * 4. Sets up listener for SHOW_ALERT messages from background
 */
function initialize(): void {
  console.log('SendSafe: Content script initialized');
  
  // -------------------------------------------------------------------------
  // Part 1: Paste Detection Setup
  // -------------------------------------------------------------------------
  
  // Find and monitor any compose boxes already on the page
  findAndMonitorComposeBoxes();
  
  // Watch for new compose boxes (Gmail creates them dynamically)
  observeDOMForComposeBoxes();
  
  // -------------------------------------------------------------------------
  // Part 2: Alert Display Setup
  // -------------------------------------------------------------------------
  
  // Set up listener for SHOW_ALERT messages from background script
  // This allows us to display the in-page modal when AI traces are detected
  setupAlertMessageListener();
  
  // Inject the modal styles into the page
  // We do this once at startup so the styles are ready when we need them
  injectModalStyles();
}

// ---------------------------------------------------------------------------
// Finding Compose Boxes
// ---------------------------------------------------------------------------

/**
 * Finds all Gmail compose boxes on the page and starts monitoring them
 * 
 * Gmail has several types of compose boxes:
 * - Main compose window
 * - Reply boxes
 * - Forward boxes
 * - Pop-out compose windows
 * 
 * We try multiple CSS selectors to catch all of them.
 */
function findAndMonitorComposeBoxes(): void {
  // Try each selector from config until we find matches
  for (const selector of config.gmail.composeSelectors) {
    // querySelectorAll returns all elements matching the selector
    // NodeListOf<Element> is like an array of DOM elements
    const elements = document.querySelectorAll<HTMLElement>(selector);
    
    // If we found elements with this selector, monitor them
    if (elements.length > 0) {
      console.log(`SendSafe: Found ${elements.length} compose box(es) with selector: ${selector}`);
      
      // Loop through each element and attach listener
      // forEach is like a for loop but cleaner
      elements.forEach((element) => {
        attachPasteListener(element);
      });
    }
  }
}

/**
 * Watches the page for new compose boxes being added
 * 
 * Gmail is a Single Page Application (SPA) that creates/removes
 * elements without reloading the page. We need to watch for changes.
 * 
 * MutationObserver is a browser API that watches for DOM changes:
 * - Elements added/removed
 * - Attributes changed
 * - Text content changed
 */
function observeDOMForComposeBoxes(): void {
  // Create a MutationObserver with a callback function
  // The callback runs whenever the DOM changes
  const observer = new MutationObserver((mutations) => {
    // mutations is an array of changes that occurred
    // We check if any new nodes were added
    
    // Check if any mutations added new nodes
    const hasNewNodes = mutations.some((mutation) => 
      mutation.addedNodes.length > 0
    );
    
    // If new nodes were added, check for compose boxes
    if (hasNewNodes) {
      findAndMonitorComposeBoxes();
    }
  });
  
  // Start observing the entire document body
  // Options specify what changes to watch for
  observer.observe(document.body, {
    childList: true,      // Watch for added/removed children
    subtree: true,        // Watch all descendants, not just direct children
  });
  
  console.log('SendSafe: DOM observer started');
}

// ---------------------------------------------------------------------------
// Paste Event Handling
// ---------------------------------------------------------------------------

/**
 * Attaches a paste event listener to a compose box
 * 
 * @param element - The compose box element to monitor
 */
function attachPasteListener(element: HTMLElement): void {
  // Check if we're already monitoring this element
  // Prevents duplicate listeners on the same element
  if (monitoredElements.has(element)) {
    return; // Already monitoring, skip
  }
  
  // Add to our tracking set
  monitoredElements.add(element);
  
  // Add paste event listener
  // 'paste' event fires when user pastes content (Ctrl+V or right-click paste)
  element.addEventListener('paste', handlePaste);
  
  console.log('SendSafe: Attached paste listener to compose box');
}

/**
 * Handles paste events
 * 
 * @param event - The paste event object from the browser
 * 
 * ClipboardEvent contains information about what was pasted:
 * - event.clipboardData - the clipboard contents
 * - event.target - the element that was pasted into
 * - event.preventDefault() - stops the default paste behavior
 */
async function handlePaste(event: ClipboardEvent): Promise<void> {
  // -------------------------------------------------------------------------
  // PERFORMANCE TIMING: Track time from paste to completion
  // -------------------------------------------------------------------------
  const pasteTimestamp = performance.now();
  lastPasteStartTime = pasteTimestamp; // Store for modal timing measurement
  console.log('SendSafe: ⏱️ [TIMING] Paste detected, starting timer');
  
  // -------------------------------------------------------------------------
  // Step 1: Extract pasted text
  // -------------------------------------------------------------------------
  
  // Get the clipboard data from the event
  // clipboardData contains the pasted content
  const clipboardData = event.clipboardData;
  
  // Safety check: make sure clipboardData exists
  if (!clipboardData) {
    console.log('SendSafe: No clipboard data available');
    return;
  }
  
  // Extract plain text from clipboard
  // 'text/plain' gets text without HTML formatting
  // We want plain text because HTML can be misleading
  const pastedText = clipboardData.getData('text/plain');
  
  // -------------------------------------------------------------------------
  // Step 2: Validate the text
  // -------------------------------------------------------------------------
  
  // Check if text is empty or too short
  if (!pastedText || pastedText.trim().length < config.text.minLength) {
    console.log('SendSafe: Pasted text too short, skipping check');
    return;
  }
  
  // Check if text is too long (truncate if needed)
  let textToCheck = pastedText;
  if (textToCheck.length > config.text.maxLength) {
    console.log(`SendSafe: Text truncated from ${textToCheck.length} to ${config.text.maxLength} characters`);
    textToCheck = textToCheck.substring(0, config.text.maxLength);
  }
  
  // -------------------------------------------------------------------------
  // Step 3: Client-side rate limiting
  // -------------------------------------------------------------------------
  
  // Check if we've checked recently
  // This prevents spamming if user pastes multiple times quickly
  const now = Date.now(); // Current time in milliseconds
  const timeSinceLastCheck = now - lastCheckTimestamp;
  
  if (timeSinceLastCheck < config.rateLimiting.minTimeBetweenChecksMs) {
    console.log(`SendSafe: Rate limit - wait ${config.rateLimiting.minTimeBetweenChecksMs - timeSinceLastCheck}ms`);
    return;
  }
  
  // Update last check timestamp
  lastCheckTimestamp = now;
  
  const validationTime = performance.now();
  console.log(`SendSafe: ⏱️ [TIMING] Text extraction & validation took ${(validationTime - pasteTimestamp).toFixed(0)}ms`);
  
  // -------------------------------------------------------------------------
  // Step 4: Send to background script for analysis
  // -------------------------------------------------------------------------
  
  console.log(`SendSafe: Sending ${textToCheck.length} characters for analysis`);

  // Show immediate UI feedback so the user knows we're working
  // This is intentionally shown BEFORE the background/API work starts.
  showStatusIndicator();
  
  // Create message object
  const message: PasteDetectedMessage = {
    type: 'PASTE_DETECTED',
    text: textToCheck,
    timestamp: now,
  };
  
  // Send message to background script
  // chrome.runtime.sendMessage sends a message to the extension's background script
  // The background script will call the API and show notifications
  try {
    const sendMessageStart = performance.now();
    
    // sendMessage returns a Promise that resolves with the response
    const response = await chrome.runtime.sendMessage(message);
    
    const sendMessageEnd = performance.now();
    const totalTime = sendMessageEnd - pasteTimestamp;
    const roundTripTime = sendMessageEnd - sendMessageStart;
    
    // Log the response and timing for debugging
    console.log('SendSafe: Background script response:', response);
    console.log(`SendSafe: ⏱️ [TIMING] Background round-trip took ${roundTripTime.toFixed(0)}ms`);
    console.log(`SendSafe: ⏱️ [TIMING] TOTAL time from paste to response: ${totalTime.toFixed(0)}ms`);

    // Always dismiss the status indicator once the background flow completes.
    // (Modal display functions will also dismiss it; this is safe and prevents
    // the indicator from sticking around if an old modal is still open.)
    dismissStatusIndicator();
  } catch (error) {
    // If sending message fails, log the error
    console.error('SendSafe: Failed to send message to background script:', error);

    // Don't leave the status indicator hanging if messaging fails
    dismissStatusIndicator();
  }
}

// ---------------------------------------------------------------------------
// Cleanup (Optional)
// ---------------------------------------------------------------------------

/**
 * Removes paste listener from an element
 * 
 * This is good practice for cleanup, though in practice Gmail
 * removes elements and browsers automatically clean up listeners.
 * 
 * @param element - The element to stop monitoring
 */
function detachPasteListener(element: HTMLElement): void {
  if (monitoredElements.has(element)) {
    element.removeEventListener('paste', handlePaste);
    monitoredElements.delete(element);
    console.log('SendSafe: Detached paste listener from compose box');
  }
}

// ===========================================================================
// ALERT MODAL SYSTEM
// ===========================================================================
// This section handles displaying the dark-themed in-page modal alerts.
// When the background script detects AI traces, it sends a SHOW_ALERT message
// to this content script, which then creates and displays the modal.
//
// DESIGN SPECIFICATIONS:
// - Position: Top-right corner, 20px from edges
// - Theme: Dark charcoal background (#1e1e2e)
// - Accent: Orange (#ff6b35) for warning icon and button
// - Auto-dismiss: 10 seconds (matching previous notification behavior)
// - Dismiss options: X button, "Got it" button, or auto-dismiss
// ===========================================================================

// ---------------------------------------------------------------------------
// Alert Message Listener
// ---------------------------------------------------------------------------

/**
 * Sets up the listener for SHOW_ALERT messages from background script
 * 
 * This function registers a message listener using chrome.runtime.onMessage.
 * When the background script sends a SHOW_ALERT message, this listener
 * receives it and calls the appropriate display function.
 * 
 * MESSAGE FLOW:
 * 1. Background script calls chrome.tabs.sendMessage()
 * 2. This listener receives the message
 * 3. We check if it's a SHOW_ALERT message
 * 4. We call showAlertModal() to display the alert
 */
function setupAlertMessageListener(): void {
  // chrome.runtime.onMessage.addListener() registers a function that gets
  // called whenever any part of the extension sends a message to this tab
  chrome.runtime.onMessage.addListener(
    (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      // -----------------------------------------------------------------------
      // Check if this is a SHOW_ALERT message
      // -----------------------------------------------------------------------
      // We check the 'type' property to identify what kind of message this is
      // This prevents us from responding to other message types
      
      if (message.type === 'SHOW_ALERT') {
        console.log('SendSafe: Received SHOW_ALERT message', message);
        
        // Cast the message to our typed interface
        // 'as' tells TypeScript we know what type this is
        const alertMessage = message as ShowAlertMessage;
        
        // Display the alert modal based on alert type
        if (alertMessage.alertType === 'warning' && alertMessage.result) {
          // Warning alert: AI traces were detected
          showWarningModal(alertMessage.result);
        } else if (alertMessage.alertType === 'error' && alertMessage.errorMessage) {
          // Error alert: Something went wrong
          showErrorModal(alertMessage.errorMessage);
        }
        
        // Send acknowledgment back to background script
        // This lets the background know we received the message
        sendResponse({ received: true });
      }
      
      // Return true to indicate we might respond asynchronously
      // (though in this case we respond immediately)
      return true;
    }
  );
  
  console.log('SendSafe: Alert message listener set up');
}

// ---------------------------------------------------------------------------
// Modal Styles
// ---------------------------------------------------------------------------

/**
 * Injects the CSS styles for the modal into the page
 * 
 * We inject styles once at startup rather than inline on each modal.
 * This keeps the modal HTML cleaner and makes styles easier to maintain.
 * 
 * WHY USE A UNIQUE PREFIX (sendsafe-)?
 * - Gmail has its own CSS styles
 * - Using a unique prefix prevents our styles from conflicting with Gmail's
 * - It also prevents Gmail's styles from affecting our modal
 * 
 * IMPORTANT CSS CONCEPTS EXPLAINED:
 * - position: fixed → Element stays in same viewport position even when scrolling
 * - z-index: 999999 → Very high number ensures modal appears on top of everything
 * - transform: translateX → Used for slide-in animation
 * - transition → Smoothly animates property changes
 */
function injectModalStyles(): void {
  // Check if styles are already injected (prevent duplicates on re-initialization)
  // getElementById returns null if element doesn't exist
  if (document.getElementById('sendsafe-modal-styles')) {
    return; // Styles already exist, don't inject again
  }
  
  // Create a <style> element to hold our CSS
  // document.createElement() creates a new HTML element
  const styleElement = document.createElement('style');
  
  // Set an ID so we can check if it exists later
  styleElement.id = 'sendsafe-modal-styles';
  
  // Define all the CSS styles as a template literal string
  // Template literals (backticks) allow multi-line strings
  styleElement.textContent = `
    /* =========================================================
       SendSafe Modal Styles
       ========================================================= */
    
    /* ---------------------------------------------------------
       Modal Container (the dark box)
       --------------------------------------------------------- */
    .sendsafe-modal {
      /* Positioning: fixed to viewport, top-right corner */
      position: fixed;
      top: 20px;
      right: 20px;
      
      /* Size and shape */
      width: 380px;
      max-width: calc(100vw - 40px);  /* Don't overflow on small screens */
      border-radius: 12px;            /* Rounded corners */
      
      /* Colors: Dark theme */
      background-color: #1e1e2e;      /* Dark charcoal */
      color: #f1f1f1;                 /* Off-white text */
      
      /* Shadow for depth effect */
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      
      /* Ensure modal appears above everything else */
      z-index: 999999;
      
      /* Font settings */
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      
      /* Animation: Start off-screen to the right, then slide in */
      transform: translateX(120%);
      opacity: 0;
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
    }
    
    /* When modal is visible, slide it into view */
    .sendsafe-modal.sendsafe-visible {
      transform: translateX(0);
      opacity: 1;
    }
    
    /* When modal is fading out (before removal) */
    .sendsafe-modal.sendsafe-fade-out {
      transform: translateX(120%);
      opacity: 0;
    }
    
    /* ---------------------------------------------------------
       Modal Header (icon, title, close button)
       --------------------------------------------------------- */
    .sendsafe-modal-header {
      display: flex;                  /* Flexbox for horizontal layout */
      align-items: center;            /* Vertically center items */
      padding: 16px 16px 12px 16px;
      border-bottom: 1px solid #2d2d44;  /* Subtle separator line */
    }
    
    /* Warning icon (triangle with !) */
    .sendsafe-icon {
      width: 24px;
      height: 24px;
      margin-right: 12px;
      flex-shrink: 0;                 /* Don't shrink the icon */
    }
    
    /* Title text */
    .sendsafe-title {
      flex: 1;                        /* Take remaining space */
      font-weight: 600;               /* Semi-bold */
      font-size: 16px;
      color: #ffffff;
      margin: 0;
    }
    
    /* Close button (X) */
    .sendsafe-close-btn {
      background: none;
      border: none;
      color: #a0a0a0;                 /* Gray color */
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s, color 0.2s;
    }
    
    /* Close button hover effect */
    .sendsafe-close-btn:hover {
      background-color: #2d2d44;
      color: #ffffff;
    }
    
    /* ---------------------------------------------------------
       Modal Body (message and content box)
       --------------------------------------------------------- */
    .sendsafe-modal-body {
      padding: 16px;
    }
    
    /* Main message text */
    .sendsafe-message {
      color: #d0d0d0;                 /* Slightly dimmer than title */
      margin-bottom: 16px;
    }
    
    /* Content box (shows detected AI traces) */
    .sendsafe-content-box {
      background-color: #2d2d44;      /* Slightly lighter than modal */
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }
    
    /* Label inside content box */
    .sendsafe-content-label {
      font-weight: 500;
      color: #a0a0a0;                 /* Gray label */
      margin-bottom: 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* List of detected items */
    .sendsafe-content-list {
      list-style: none;               /* Remove bullet points */
      padding: 0;
      margin: 0;
    }
    
    .sendsafe-content-list li {
      color: #f1f1f1;
      padding: 4px 0;
      border-bottom: 1px solid #3d3d54;
    }
    
    .sendsafe-content-list li:last-child {
      border-bottom: none;            /* No border on last item */
    }
    
    /* Snippet text (the actual AI trace found) */
    .sendsafe-snippet {
      font-style: italic;
      color: #ff6b35;                 /* Orange accent for emphasis */
      word-break: break-word;         /* Break long words if needed */
    }
    
    /* ---------------------------------------------------------
       Modal Footer (Got it button)
       --------------------------------------------------------- */
    .sendsafe-modal-footer {
      padding: 0 16px 16px 16px;
      display: flex;
      justify-content: center;        /* Center the button */
    }
    
    /* "Got it" button */
    .sendsafe-btn {
      background-color: #ff6b35;      /* Orange accent */
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 10px 32px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    /* Button hover effect */
    .sendsafe-btn:hover {
      background-color: #e55a28;      /* Slightly darker orange */
    }
    
    /* Error-specific styles */
    .sendsafe-modal.sendsafe-error .sendsafe-icon svg {
      fill: #ef4444;                  /* Red for errors */
    }
    
    .sendsafe-modal.sendsafe-error .sendsafe-btn {
      background-color: #ef4444;      /* Red button for errors */
    }
    
    .sendsafe-modal.sendsafe-error .sendsafe-btn:hover {
      background-color: #dc2626;
    }

    /* ---------------------------------------------------------
       Modal transition when coming FROM status indicator
       --------------------------------------------------------- */
    .sendsafe-modal.sendsafe-from-status {
      transform: translateX(0) scale(0.13);
      opacity: 1;
      transform-origin: top right;
      transition: transform 0.4s ease-out, opacity 0.3s ease-out;
    }

    .sendsafe-modal.sendsafe-from-status.sendsafe-visible {
      transform: translateX(0) scale(1);
      opacity: 1;
    }

    /* =========================================================
       SendSafe Floating Status Indicator (Immediate Feedback)
       ========================================================= */

    .sendsafe-status-indicator {
      /* Keep consistent with modal positioning and theme */
      width: 48px;
      height: 48px;
      border-radius: 12px; /* match modal radius per design spec */
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      overflow: hidden;

      /* Override base modal transform so we can scale in smoothly */
      transform: translateX(120%) scale(0.92);
      opacity: 0;
      transition: transform 0.2s ease-out, opacity 0.2s ease-out;
    }

    .sendsafe-status-indicator.sendsafe-visible {
      transform: translateX(0) scale(1);
      opacity: 1;
    }

    .sendsafe-status-indicator.sendsafe-fade-out {
      transform: translateX(120%) scale(0.92);
      opacity: 0;
    }

    .sendsafe-status-ring {
      width: 28px;
      height: 28px;
      display: block;
      animation: sendsafe-rotate 2s linear infinite;
      filter: drop-shadow(0 0 4px rgba(255, 107, 53, 0.5));
    }

    .sendsafe-status-ring circle {
      stroke: #ff6b35;
      stroke-width: 3;
      fill: none;
      stroke-linecap: round;
      stroke-dasharray: 36;
      stroke-dashoffset: 18;
    }


    @keyframes sendsafe-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  
  // Add the style element to the document's <head>
  // document.head is the <head> element of the page
  // appendChild adds a child element to the end
  document.head.appendChild(styleElement);
  
  console.log('SendSafe: Modal styles injected');
}

// ---------------------------------------------------------------------------
// Floating Status Indicator (Immediate Feedback)
// ---------------------------------------------------------------------------

/**
 * Shows a small floating status indicator immediately after paste.
 * This reduces perceived latency by confirming that SendSafe is working.
 */
function showStatusIndicator(): void {
  // Only one indicator at a time
  dismissStatusIndicator();

  const indicator = document.createElement('div');
  indicator.className = 'sendsafe-modal sendsafe-status-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-label', 'SendSafe is analyzing pasted text');
  indicator.style.position = 'fixed';

  // Center content with a rotating progress ring
  indicator.innerHTML = `
    <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
      <svg class="sendsafe-status-ring" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="12"></circle>
      </svg>
    </div>
  `;

  document.body.appendChild(indicator);
  currentStatusIndicator = indicator;

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      indicator.classList.add('sendsafe-visible');
    });
  });

  // Safety timeout in case we never get a response/message
  statusSafetyTimeout = window.setTimeout(() => {
    dismissStatusIndicator();
  }, STATUS_SAFETY_TIMEOUT_MS);
}

/**
 * Dismisses the status indicator with the same fade-out behavior as the modal.
 */
function dismissStatusIndicator(): void {
  if (!currentStatusIndicator) {
    return;
  }

  if (statusSafetyTimeout !== null) {
    clearTimeout(statusSafetyTimeout);
    statusSafetyTimeout = null;
  }

  const indicatorToRemove = currentStatusIndicator;
  currentStatusIndicator = null;

  indicatorToRemove.classList.remove('sendsafe-visible');
  indicatorToRemove.classList.add('sendsafe-fade-out');

  setTimeout(() => {
    if (indicatorToRemove.parentNode) {
      indicatorToRemove.parentNode.removeChild(indicatorToRemove);
    }
  }, 350);
}

// ---------------------------------------------------------------------------
// Warning Modal Display
// ---------------------------------------------------------------------------

/**
 * Creates and displays the warning modal when AI traces are detected
 * 
 * This function builds the modal HTML, adds it to the page, and sets up
 * the auto-dismiss timer and click handlers.
 * 
 * @param result - The detection result from the backend API
 */
function showWarningModal(result: APISuccessResponse): void {
  // Calculate end-to-end timing from paste to modal display
  const modalShowTime = performance.now();
  const endToEndTime = lastPasteStartTime > 0 ? modalShowTime - lastPasteStartTime : 0;
  
  console.log('SendSafe: Showing warning modal');
  console.log(`SendSafe: ⏱️ [TIMING] END-TO-END: ${endToEndTime.toFixed(0)}ms from paste to modal display`);
  
  // Remove any existing modal first
  // We only want one modal visible at a time
  dismissModal();
  
  // -------------------------------------------------------------------------
  // Build the modal HTML
  // -------------------------------------------------------------------------
  
  // Count how many AI traces were found
  const traceCount = result.indicators.length;
  
  // Create the modal container
  // document.createElement creates a new HTML element
  const modal = document.createElement('div');
  const isFromStatusIndicator = !!currentStatusIndicator;
  modal.className = isFromStatusIndicator ? 'sendsafe-modal sendsafe-from-status' : 'sendsafe-modal';
  
  // Build the inner HTML using template literals
  // Template literals allow us to embed variables with ${variable}
  modal.innerHTML = `
    <!-- Header: Icon, Title, Close Button -->
    <div class="sendsafe-modal-header">
      <!-- Warning Icon (SVG triangle with exclamation) -->
      <div class="sendsafe-icon">
        <svg viewBox="0 0 24 24" fill="#ff6b35" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
        </svg>
      </div>
      
      <!-- Title -->
      <h3 class="sendsafe-title">AI Traces Detected</h3>
      
      <!-- Close Button (X) -->
      <button class="sendsafe-close-btn" aria-label="Close">&times;</button>
    </div>
    
    <!-- Body: Message and Content Box -->
    <div class="sendsafe-modal-body">
      <!-- Main Message -->
      <p class="sendsafe-message">
        Found ${traceCount} AI trace${traceCount !== 1 ? 's' : ''} in your email. 
        Please review and remove them before sending.
      </p>
      
      <!-- Content Box with detected items -->
      <div class="sendsafe-content-box">
        <div class="sendsafe-content-label">Detected:</div>
        <ul class="sendsafe-content-list">
          ${buildIndicatorsList(result.indicators)}
        </ul>
      </div>
    </div>
    
    <!-- Footer: Got it Button -->
    <div class="sendsafe-modal-footer">
      <button class="sendsafe-btn">Got it</button>
    </div>
  `;
  
  // -------------------------------------------------------------------------
  // Add modal to the page
  // -------------------------------------------------------------------------
  
  // Add to document body
  document.body.appendChild(modal);
  
  // Store reference so we can remove it later
  currentModal = modal;

  // Now that we're showing the final UI, fade out the status indicator.
  // Keeping a brief overlap prevents a “dead air” gap.
  dismissStatusIndicator();
  
  // -------------------------------------------------------------------------
  // Set up event handlers
  // -------------------------------------------------------------------------
  
  // Close button (X) click handler
  // querySelector finds the first element matching the CSS selector
  const closeBtn = modal.querySelector('.sendsafe-close-btn');
  if (closeBtn) {
    // addEventListener attaches a function to run when an event occurs
    closeBtn.addEventListener('click', () => {
      dismissModal();
    });
  }
  
  // "Got it" button click handler
  const gotItBtn = modal.querySelector('.sendsafe-btn');
  if (gotItBtn) {
    gotItBtn.addEventListener('click', () => {
      dismissModal();
    });
  }
  
  // -------------------------------------------------------------------------
  // Trigger the slide-in animation
  // -------------------------------------------------------------------------
  
  // We use requestAnimationFrame to ensure the initial styles are applied
  // before we add the 'visible' class that triggers the animation
  // 
  // requestAnimationFrame tells the browser to call our function before
  // the next repaint, which ensures the CSS transition works properly
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.classList.add('sendsafe-visible');
    });
  });
  
  // -------------------------------------------------------------------------
  // Set up auto-dismiss timer
  // -------------------------------------------------------------------------
  
  // Clear any existing timeout to prevent multiple timers
  if (autoDismissTimeout !== null) {
    clearTimeout(autoDismissTimeout);
  }
  
  // Set new timeout to auto-dismiss after 10 seconds
  // setTimeout returns a number (timer ID) that we can use to cancel it
  autoDismissTimeout = window.setTimeout(() => {
    console.log('SendSafe: Auto-dismissing modal after 10 seconds');
    dismissModal();
  }, AUTO_DISMISS_MS);
  
  console.log('SendSafe: Warning modal displayed, will auto-dismiss in 10 seconds');
}

/**
 * Builds the HTML for the list of detected AI indicators
 * 
 * This function takes the array of indicators and creates <li> elements
 * for each one, showing the type and a snippet of the detected text.
 * 
 * @param indicators - Array of detected AI indicators
 * @returns HTML string with <li> elements
 */
function buildIndicatorsList(indicators: APISuccessResponse['indicators']): string {
  // If no indicators, show a generic message
  if (indicators.length === 0) {
    return '<li>AI artifacts detected in your text</li>';
  }
  
  // Map each indicator to an <li> element
  // .map() transforms each item in the array
  // .join('') combines all the strings into one
  return indicators
    .map((indicator) => {
      // Truncate long snippets to prevent huge modals
      // This keeps the UI clean and readable
      const snippet = indicator.snippet.length > 60
        ? indicator.snippet.substring(0, 60) + '...'
        : indicator.snippet;
      
      // Return the HTML for this list item
      return `
        <li>
          <strong>${escapeHtml(indicator.type)}</strong>
          ${snippet ? `: <span class="sendsafe-snippet">"${escapeHtml(snippet)}"</span>` : ''}
        </li>
      `;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Error Modal Display
// ---------------------------------------------------------------------------

/**
 * Creates and displays the error modal when something goes wrong
 * 
 * Similar to showWarningModal but with different styling and content.
 * 
 * @param errorMessage - The error message to display
 */
function showErrorModal(errorMessage: string): void {
  console.log('SendSafe: Showing error modal');
  
  // Remove any existing modal first
  dismissModal();
  
  // Create the modal container with error class
  const modal = document.createElement('div');
  const isFromStatusIndicator = !!currentStatusIndicator;
  modal.className = isFromStatusIndicator
    ? 'sendsafe-modal sendsafe-error sendsafe-from-status'
    : 'sendsafe-modal sendsafe-error';
  
  modal.innerHTML = `
    <!-- Header: Icon, Title, Close Button -->
    <div class="sendsafe-modal-header">
      <!-- Error Icon (X in circle) -->
      <div class="sendsafe-icon">
        <svg viewBox="0 0 24 24" fill="#ef4444" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
      </div>
      
      <!-- Title -->
      <h3 class="sendsafe-title">SendSafe Error</h3>
      
      <!-- Close Button (X) -->
      <button class="sendsafe-close-btn" aria-label="Close">&times;</button>
    </div>
    
    <!-- Body: Error Message -->
    <div class="sendsafe-modal-body">
      <p class="sendsafe-message">${escapeHtml(errorMessage)}</p>
    </div>
    
    <!-- Footer: Got it Button -->
    <div class="sendsafe-modal-footer">
      <button class="sendsafe-btn">Got it</button>
    </div>
  `;
  
  // Add modal to the page
  document.body.appendChild(modal);
  currentModal = modal;

  // Fade out the status indicator once the error UI is displayed
  dismissStatusIndicator();
  
  // Set up event handlers
  const closeBtn = modal.querySelector('.sendsafe-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dismissModal());
  }
  
  const gotItBtn = modal.querySelector('.sendsafe-btn');
  if (gotItBtn) {
    gotItBtn.addEventListener('click', () => dismissModal());
  }
  
  // Trigger slide-in animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.classList.add('sendsafe-visible');
    });
  });
  
  // Set up auto-dismiss (same as warning modal)
  if (autoDismissTimeout !== null) {
    clearTimeout(autoDismissTimeout);
  }
  
  autoDismissTimeout = window.setTimeout(() => {
    dismissModal();
  }, AUTO_DISMISS_MS);
}

// ---------------------------------------------------------------------------
// Modal Dismiss Function
// ---------------------------------------------------------------------------

/**
 * Dismisses the current modal with a fade-out animation
 * 
 * This function:
 * 1. Cancels the auto-dismiss timeout (if active)
 * 2. Adds fade-out class to trigger animation
 * 3. Removes the modal from DOM after animation completes
 */
function dismissModal(): void {
  // If no modal is currently shown, nothing to do
  if (!currentModal) {
    return;
  }
  
  console.log('SendSafe: Dismissing modal');
  
  // Cancel auto-dismiss timeout if it's still active
  // This prevents the timeout from firing after manual dismiss
  if (autoDismissTimeout !== null) {
    clearTimeout(autoDismissTimeout);
    autoDismissTimeout = null;
  }
  
  // Store reference to the modal we're dismissing
  // (in case a new modal is created during the animation)
  const modalToRemove = currentModal;
  
  // Clear the current modal reference
  currentModal = null;
  
  // Add fade-out class to trigger exit animation
  modalToRemove.classList.remove('sendsafe-visible');
  modalToRemove.classList.add('sendsafe-fade-out');
  
  // Remove the modal from DOM after animation completes
  // The CSS transition is 0.3s (300ms), so we wait slightly longer
  setTimeout(() => {
    // Check if the element still exists and is still in the document
    // (it might have been removed by something else)
    if (modalToRemove.parentNode) {
      modalToRemove.parentNode.removeChild(modalToRemove);
    }
  }, 350); // 350ms to ensure animation is complete
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Escapes HTML special characters to prevent XSS attacks
 * 
 * This is important when displaying user-provided or API-provided content.
 * Without escaping, malicious content could inject HTML/JavaScript.
 * 
 * EXAMPLE:
 * Input: '<script>alert("hack")</script>'
 * Output: '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;'
 * 
 * The browser will display this as text, not execute it as HTML.
 * 
 * @param text - The text to escape
 * @returns The escaped text safe for HTML insertion
 */
function escapeHtml(text: string): string {
  // Create a temporary div element
  // This is a common trick for HTML escaping
  const div = document.createElement('div');
  
  // Set the text content (this automatically escapes HTML)
  // textContent treats the input as plain text, not HTML
  div.textContent = text;
  
  // Return the innerHTML (which is now escaped)
  // innerHTML returns the escaped version of what we set
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Start the Script
// ---------------------------------------------------------------------------

// Check if document is already loaded
// document.readyState tells us the loading state:
// - 'loading' - still loading
// - 'interactive' - DOM ready but resources still loading
// - 'complete' - fully loaded
if (document.readyState === 'loading') {
  // If still loading, wait for DOMContentLoaded event
  // This event fires when the HTML is fully parsed
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  // If already loaded, initialize immediately
  initialize();
}

// ---------------------------------------------------------------------------
// Documentation Comments
// ---------------------------------------------------------------------------

/**
 * CONTENT SCRIPT LIFECYCLE:
 * 
 * 1. Script loads when user opens Gmail
 * 2. initialize() runs:
 *    a. Finds existing compose boxes
 *    b. Starts watching for new compose boxes
 *    c. Sets up alert message listener
 *    d. Injects modal CSS styles
 * 3. When user pastes:
 *    a. handlePaste() extracts text
 *    b. Validates and truncates text
 *    c. Checks rate limit
 *    d. Sends PASTE_DETECTED message to background script
 * 4. Background script calls API and sends SHOW_ALERT message back
 * 5. Alert message listener receives message and displays modal
 * 6. Modal auto-dismisses after 10 seconds or on user interaction
 * 
 * WHY SPLIT BETWEEN CONTENT AND BACKGROUND SCRIPTS?
 * 
 * Content Script:
 * - Runs in web page context
 * - Can access page DOM (Gmail elements, inject modal)
 * - Limited Chrome API access
 * - Can't make cross-origin requests directly
 * 
 * Background Script:
 * - Runs in extension context
 * - Full Chrome API access (tabs.sendMessage)
 * - Can make cross-origin requests (to our backend)
 * - Can't access page DOM
 * 
 * They communicate via:
 * - chrome.runtime.sendMessage() → Content to Background
 * - chrome.tabs.sendMessage() → Background to Content
 */

/**
 * IN-PAGE MODAL vs SYSTEM NOTIFICATIONS:
 * 
 * Previous approach (system notifications):
 * - Limited styling options
 * - Appears in OS notification center
 * - User might miss it if notifications are disabled
 * - Can't show detailed information easily
 * 
 * New approach (in-page modal):
 * - Full control over styling (dark theme, orange accent)
 * - Appears right where user is working
 * - Can show detailed list of detected AI traces
 * - Better user experience
 * - Auto-dismiss matches previous notification behavior (10 seconds)
 */

/**
 * DEBUGGING TIPS:
 * 
 * 1. Open Chrome DevTools on Gmail page
 * 2. Look for "SendSafe:" messages in console:
 *    - "Content script initialized" = Script loaded successfully
 *    - "Received SHOW_ALERT message" = Alert message received from background
 *    - "Showing warning modal" = Modal is being created
 *    - "Dismissing modal" = Modal is being removed
 * 3. Check if compose boxes are found
 * 4. Check if paste events are detected
 * 5. Check if messages are sent to background
 * 
 * To debug modal styling:
 * - Use DevTools Elements panel to inspect .sendsafe-modal
 * - Check that styles from #sendsafe-modal-styles are applied
 * 
 * Common issues:
 * - Selectors don't match Gmail's current HTML structure
 * - Script loads before Gmail finishes rendering
 * - Multiple listeners attached to same element
 * - Rate limiting blocking legitimate pastes
 * - Modal styles conflicting with Gmail's CSS (check z-index)
 */

