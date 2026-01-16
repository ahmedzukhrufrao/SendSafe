// ============================================================================
// Content Script - Gmail Paste Detection
// ============================================================================
// This script runs inside Gmail pages and detects when users paste text
// into email compose boxes.
//
// WHAT THIS SCRIPT DOES:
// 1. Finds Gmail's compose boxes (main compose, reply, forward, pop-out)
// 2. Listens for paste events on those boxes
// 3. Extracts the pasted text
// 4. Sends it to the background script for analysis
//
// IMPORTANT: Content scripts run in the context of web pages, so they can
// access the DOM (page elements) but have limited access to Chrome APIs.
// That's why we send messages to the background script for API calls.
// ============================================================================

import { config } from './config';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Message sent to background script when paste is detected
 */
interface PasteDetectedMessage {
  type: 'PASTE_DETECTED';
  text: string;
  timestamp: number;
}

/**
 * Message types we can receive from background script
 */
interface BackgroundResponse {
  success: boolean;
  error?: string;
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

// ---------------------------------------------------------------------------
// Main Initialization
// ---------------------------------------------------------------------------

/**
 * Entry point - called when script loads
 * 
 * This function sets up everything needed to detect pastes:
 * 1. Finds existing compose boxes
 * 2. Watches for new compose boxes
 * 3. Attaches paste listeners
 */
function initialize(): void {
  console.log('SendSafe: Content script initialized');
  
  // Find and monitor any compose boxes already on the page
  findAndMonitorComposeBoxes();
  
  // Watch for new compose boxes (Gmail creates them dynamically)
  observeDOMForComposeBoxes();
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
  console.log('SendSafe: Paste detected');
  
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
  
  // -------------------------------------------------------------------------
  // Step 4: Send to background script for analysis
  // -------------------------------------------------------------------------
  
  console.log(`SendSafe: Sending ${textToCheck.length} characters for analysis`);
  
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
    // sendMessage returns a Promise that resolves with the response
    const response = await chrome.runtime.sendMessage(message);
    
    // Log the response for debugging
    console.log('SendSafe: Background script response:', response);
  } catch (error) {
    // If sending message fails, log the error
    console.error('SendSafe: Failed to send message to background script:', error);
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
 * 2. initialize() runs
 * 3. Finds existing compose boxes
 * 4. Starts watching for new compose boxes
 * 5. When user pastes:
 *    a. handlePaste() extracts text
 *    b. Validates and truncates text
 *    c. Checks rate limit
 *    d. Sends message to background script
 * 6. Background script handles API call and notifications
 * 
 * WHY SPLIT BETWEEN CONTENT AND BACKGROUND SCRIPTS?
 * 
 * Content Script:
 * - Runs in web page context
 * - Can access page DOM (Gmail elements)
 * - Limited Chrome API access
 * - Can't make cross-origin requests directly
 * 
 * Background Script:
 * - Runs in extension context
 * - Full Chrome API access
 * - Can make cross-origin requests
 * - Can't access page DOM
 * 
 * They communicate via chrome.runtime.sendMessage()
 */

/**
 * DEBUGGING TIPS:
 * 
 * 1. Open Chrome DevTools on Gmail page
 * 2. Look for "SendSafe:" messages in console
 * 3. Check if compose boxes are found
 * 4. Check if paste events are detected
 * 5. Check if messages are sent to background
 * 
 * Common issues:
 * - Selectors don't match Gmail's current HTML structure
 * - Script loads before Gmail finishes rendering
 * - Multiple listeners attached to same element
 * - Rate limiting blocking legitimate pastes
 */

