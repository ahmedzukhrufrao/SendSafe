# SendSafe Manual Test Checklist

This document provides a comprehensive checklist for manually testing SendSafe to ensure all functionality works as expected. Use this checklist before deploying updates or submitting to the Chrome Web Store.

## Test Environment Setup

### Prerequisites
- [ ] Chrome browser installed (latest version recommended)
- [ ] Backend deployed and running (local or Vercel)
- [ ] Extension loaded in Chrome (Developer mode)
- [ ] Gmail account accessible
- [ ] Internet connection active

### Configuration Verification
- [ ] Backend environment variables properly set (`.env` file or Vercel dashboard)
- [ ] Extension `config.ts` points to correct backend URL
- [ ] Shared secret matches between backend and extension
- [ ] OpenAI API key is valid and has sufficient credits

---

## Category 1: Basic Paste Detection

### Test 1.1: Detect AI Traces in New Email Compose
**Objective:** Verify the extension detects paste events in Gmail's main compose window

**Steps:**
1. Open Gmail in Chrome
2. Click "Compose" to create a new email
3. Copy the following AI-generated text:
   ```
   Sure, here's a professional email for you:
   
   Dear [Recipient Name],
   
   I hope this email finds you well. I'm writing to follow up on our previous discussion.
   
   **Key Points:**
   - Point 1
   - Point 2
   
   Let me know if you need any changes!
   ```
4. Paste the text into the email body (Ctrl+V or Cmd+V)

**Expected Result:**
- [ ] Notification appears within 3-5 seconds
- [ ] Notification title: "⚠️ AI Traces Detected in Pasted Content"
- [ ] Notification lists detected categories (e.g., "Introductory Remnant", "Bracketed Placeholder", "Markdown Artifact", "Assistant Outro")
- [ ] Notification can be dismissed
- [ ] Email body still contains the pasted text (not modified)
- [ ] You can continue editing the email normally

**Actual Result:** _____________________________

**Pass/Fail:** _____

---

### Test 1.2: Detect Category 1 - Bracketed Placeholders
**Objective:** Verify detection of template placeholders

**Test Content:**
```
Hello [Your Name],

Thank you for reaching out to {Company Name}. We will get back to you on <Date>.

Best regards,
[Sender Name]
```

**Expected Result:**
- [ ] Notification appears
- [ ] Categories found include "Bracketed Placeholder"
- [ ] Multiple placeholders detected ([Your Name], {Company Name}, <Date>, [Sender Name])

**Pass/Fail:** _____

---

### Test 1.3: Detect Category 2 - Introductory Remnants
**Objective:** Verify detection of AI acknowledgment phrases

**Test Content:**
```
Sure, here's the draft email you requested:

Hello Team,

I'd like to schedule a meeting for next week.

Thanks!
```

**Expected Result:**
- [ ] Notification appears
- [ ] Categories found include "Introductory Remnant"
- [ ] Snippet shows "Sure, here's the draft email you requested:"

**Pass/Fail:** _____

---

### Test 1.4: Detect Category 3 - Markdown Artifacts
**Objective:** Verify detection of unrendered markdown syntax

**Test Content:**
```
Hello,

Here are the **important** details:

### Meeting Agenda
- Item 1
- Item 2

Please review `this code` before the meeting.

Thanks!
```

**Expected Result:**
- [ ] Notification appears
- [ ] Categories found include "Markdown Artifact"
- [ ] Detects **, ###, ``, or similar markdown syntax

**Pass/Fail:** _____

---

### Test 1.5: Detect Category 4 - Self-Referential Statements
**Objective:** Verify detection of AI identity statements

**Test Content:**
```
Dear Colleague,

As an AI language model, I cannot provide legal advice, but I can offer general information.

I don't have access to real-time data, but based on the information you provided...

Best regards
```

**Expected Result:**
- [ ] Notification appears
- [ ] Categories found include "Self-Referential" or "Identity Statement"
- [ ] Detects "As an AI language model" and "I don't have access to"

**Pass/Fail:** _____

---

### Test 1.6: Detect Category 5 - Assistant Outro Text
**Objective:** Verify detection of meta-comments from AI

**Test Content:**
```
Dear Team,

I wanted to follow up on yesterday's meeting.

Best regards,
John

Let me know if you'd like me to adjust the tone or add more details!
```

**Expected Result:**
- [ ] Notification appears
- [ ] Categories found include "Assistant Outro" or "Conclusion Text"
- [ ] Detects "Let me know if you'd like me to adjust..."

**Pass/Fail:** _____

---

### Test 1.7: No Detection for Clean Human-Written Email
**Objective:** Verify no false positives for normal email content

**Test Content:**
```
Hi Sarah,

Thanks for your email. I wanted to follow up on the project timeline we discussed last week.

Could we schedule a quick call on Thursday at 2pm? I have a few questions about the requirements.

Looking forward to hearing from you.

Best regards,
Michael
```

**Expected Result:**
- [ ] NO notification appears
- [ ] No console errors
- [ ] Email can be edited and sent normally

**Pass/Fail:** _____

---

## Category 2: Compose Window Detection

### Test 2.1: Reply Window Detection
**Objective:** Verify paste detection works in reply compose boxes

**Steps:**
1. Open any email in Gmail
2. Click "Reply"
3. Paste AI-generated text with traces (use test from 1.1)

**Expected Result:**
- [ ] Notification appears with detected traces

**Pass/Fail:** _____

---

### Test 2.2: Forward Window Detection
**Objective:** Verify paste detection works in forward compose boxes

**Steps:**
1. Open any email in Gmail
2. Click "Forward"
3. Add content above the forwarded message
4. Paste AI-generated text with traces

**Expected Result:**
- [ ] Notification appears with detected traces

**Pass/Fail:** _____

---

### Test 2.3: Pop-Out Compose Window Detection
**Objective:** Verify paste detection works in pop-out compose windows

**Steps:**
1. Click "Compose"
2. Click the pop-out icon (opens compose in new window)
3. Paste AI-generated text with traces

**Expected Result:**
- [ ] Notification appears with detected traces
- [ ] Works in the separate window

**Pass/Fail:** _____

---

### Test 2.4: Multiple Compose Windows
**Objective:** Verify extension handles multiple simultaneous compose windows

**Steps:**
1. Open 3 compose windows simultaneously (main Gmail window)
2. Paste AI-generated text in first window - verify notification
3. Paste different AI text in second window - verify notification
4. Paste clean text in third window - verify no notification

**Expected Result:**
- [ ] Each compose window is monitored independently
- [ ] Correct notifications for each paste event
- [ ] No interference between windows

**Pass/Fail:** _____

---

## Category 3: Edge Cases & Error Handling

### Test 3.1: Empty Paste
**Objective:** Verify no API call for empty/whitespace pastes

**Steps:**
1. Compose new email
2. Copy just whitespace (spaces, tabs, newlines)
3. Paste into email body
4. Check browser DevTools Network tab

**Expected Result:**
- [ ] No notification appears
- [ ] No API call made to backend (check Network tab)
- [ ] No errors in console

**Pass/Fail:** _____

---

### Test 3.2: Very Long Paste (>5000 characters)
**Objective:** Verify truncation works for long content

**Steps:**
1. Compose new email
2. Generate or copy text longer than 5000 characters
3. Include AI traces in the first part of the text
4. Paste into email body

**Expected Result:**
- [ ] Notification appears (if traces in first 5000 chars)
- [ ] Request payload is truncated to 5000 characters (check Network tab)
- [ ] No errors or timeouts

**Pass/Fail:** _____

---

### Test 3.3: Special Characters and Unicode
**Objective:** Verify extension handles special characters correctly

**Test Content:**
```
Sure, here's your email:

Hello! 你好 Привет مرحبا

Special chars: @#$%^&*(){}[]<>|\/~`

Emojis: 😀 🎉 ✅ ⚠️

[Your Name]
```

**Expected Result:**
- [ ] Notification appears
- [ ] Special characters and Unicode don't break parsing
- [ ] Detects traces despite special characters

**Pass/Fail:** _____

---

### Test 3.4: Rapid Multiple Pastes
**Objective:** Verify extension handles multiple quick pastes gracefully

**Steps:**
1. Compose new email
2. Paste AI-generated text
3. Immediately paste again (within 1 second)
4. Paste a third time
5. Observe behavior

**Expected Result:**
- [ ] Extension handles rapid pastes without crashing
- [ ] Each paste either gets analyzed or skipped gracefully
- [ ] No console errors or stack overflow

**Pass/Fail:** _____

---

### Test 3.5: Network Error (Backend Unavailable)
**Objective:** Verify graceful error handling when backend is unreachable

**Steps:**
1. Stop the backend server (or disconnect internet)
2. Compose new email in Gmail
3. Paste AI-generated text with traces

**Expected Result:**
- [ ] Error notification appears after timeout (~10 seconds)
- [ ] Error message: "Network error. Please check your connection and try again." or similar
- [ ] No console errors crash the extension
- [ ] Gmail functionality unaffected
- [ ] Can still edit and send email

**Pass/Fail:** _____

---

### Test 3.6: Backend Timeout
**Objective:** Verify timeout handling for slow API responses

**Steps:**
1. If possible, configure backend with artificial delay (>10 seconds)
2. Or temporarily increase network latency
3. Paste AI-generated text

**Expected Result:**
- [ ] Request times out after configured timeout (10 seconds)
- [ ] Error notification appears: "Detection timed out..." or "Network error..."
- [ ] No hanging state

**Pass/Fail:** _____

---

### Test 3.7: Right-Click Paste
**Objective:** Verify paste detection works via context menu

**Steps:**
1. Compose new email
2. Copy AI-generated text with traces
3. Right-click in email body
4. Select "Paste" from context menu

**Expected Result:**
- [ ] Paste event detected
- [ ] Notification appears with detected traces

**Pass/Fail:** _____

---

### Test 3.8: Short Paste (Too Short to Analyze)
**Objective:** Verify very short pastes are ignored (no API call, no notification)

**Steps:**
1. Compose a new email
2. Copy a very short text (fewer than 10 characters), e.g.:
   ```
   Hi
   ```
3. Paste into the email body
4. Check DevTools Console for SendSafe logs

**Expected Result:**
- [ ] No notification appears
- [ ] No backend request is made for the short paste (best-effort; verify via Service Worker logs if possible)
- [ ] No errors in console

**Pass/Fail:** _____

---

### Test 3.9: Client-Side Cooldown (2 Seconds Between Checks)
**Objective:** Verify the extension throttles rapid paste events (prevents spamming the backend)

**Steps:**
1. Compose a new email
2. Paste an AI-generated text with traces (use Test 1.1)
3. Immediately paste again (within 2 seconds)
4. Open the background Service Worker console:
   - Go to `chrome://extensions`
   - Find SendSafe
   - Click the **Service worker** link
5. Check the Service Worker console logs / Network tab

**Expected Result:**
- [ ] First paste triggers analysis (backend request happens)
- [ ] Second paste within 2 seconds is skipped (no second backend request)
- [ ] No crashes or repeated errors

**Pass/Fail:** _____

---

### Test 3.10: Paste in Subject / To / Cc / Bcc Fields (Should NOT Trigger)
**Objective:** Verify detection only runs for the email body (not other Gmail fields)

**Steps:**
1. Compose a new email
2. Paste AI-generated text with traces into:
   - Subject field
   - To field (recipient)
   - Cc/Bcc field (if available)
3. Observe notifications and console logs

**Expected Result:**
- [ ] No notification appears for pastes in Subject/To/Cc/Bcc
- [ ] No backend API requests occur from these fields (best-effort; verify via Service Worker logs if possible)
- [ ] Gmail continues to work normally

**Pass/Fail:** _____

---

### Test 3.11: Service Worker Sleep/Wake Resilience
**Objective:** Verify the extension still works after the background service worker has gone idle

**Steps:**
1. Open Gmail with SendSafe enabled
2. Do nothing for ~1 minute (service worker may go idle)
3. Paste AI-generated text with traces into the email body
4. Verify behavior

**Expected Result:**
- [ ] Paste is detected and analyzed
- [ ] Notification appears (for AI-trace content)
- [ ] No missing-message or “service worker not available” type errors

**Pass/Fail:** _____

---

### Test 3.12: Multiple Gmail Tabs
**Objective:** Verify paste detection works reliably across multiple Gmail tabs/windows

**Steps:**
1. Open Gmail in two separate tabs (or windows)
2. In Tab A: compose and paste AI-generated text with traces
3. In Tab B: compose and paste AI-generated text with traces

**Expected Result:**
- [ ] Both tabs trigger detection when pasting in the email body
- [ ] Notifications appear for both pastes (when traces are detected)
- [ ] No duplicate listeners causing multiple notifications for a single paste

**Pass/Fail:** _____

---

## Category 4: Rate Limiting

### Test 4.1: Rate Limit Enforcement
**Objective:** Verify backend rate limiting works correctly

**Steps:**
1. Compose new email
2. Paste AI-generated text 11 times in quick succession (or configured limit + 1)
3. Wait for responses

**Expected Result:**
- [ ] First 10 pastes (or configured limit) succeed with normal notifications
- [ ] 11th paste returns rate limit error
- [ ] Rate limit notification appears: "Rate limit reached. Please wait..."
- [ ] HTTP 429 status in Network tab

**Pass/Fail:** _____

---

### Test 4.2: Rate Limit Reset
**Objective:** Verify rate limit resets after time window

**Steps:**
1. Hit rate limit (see Test 4.1)
2. Wait for configured window (60 minutes in MVP)
3. Paste AI-generated text again

**Expected Result:**
- [ ] After time window, rate limit resets
- [ ] New paste succeeds with normal detection
- [ ] Notification appears normally

**Pass/Fail:** _____

---

## Category 5: Security & Privacy

### Test 5.1: No OpenAI API Key in Extension Code
**Objective:** Verify OpenAI API key is not exposed in extension

**Steps:**
1. Go to `chrome://extensions`
2. Find SendSafe extension
3. Click on extension ID to view source files
4. Search for "sk-" (OpenAI key prefix)
5. Check `config.ts`, `background.ts`, `contentScript.ts`

**Expected Result:**
- [ ] No OpenAI API key found in any extension file
- [ ] Only shared secret present (which is acceptable for MVP)

**Pass/Fail:** _____

---

### Test 5.2: HTTPS Only
**Objective:** Verify all API calls use HTTPS (production)

**Steps:**
1. Open Gmail
2. Open DevTools > Network tab
3. Paste AI-generated text
4. Check request to backend

**Expected Result:**
- [ ] Backend URL uses `https://` (not `http://`)
- [ ] No mixed content warnings
- [ ] Secure connection established

**Note:** For local development, `http://localhost` is acceptable

**Pass/Fail:** _____

---

### Test 5.3: No Email Content in Logs
**Objective:** Verify pasted content is not logged in console

**Steps:**
1. Open DevTools > Console
2. Paste AI-generated text
3. Review all console messages

**Expected Result:**
- [ ] Extension logs status messages (e.g., "SendSafe: Paste detected")
- [ ] Extension does NOT log full pasted content
- [ ] Extension does NOT log OpenAI responses with user content
- [ ] Secrets (API keys, shared secret) are NOT logged

**Pass/Fail:** _____

---

### Test 5.4: Shared Secret Header
**Objective:** Verify shared secret is sent correctly

**Steps:**
1. Open DevTools > Network tab
2. Paste AI-generated text
3. Find request to backend
4. Click on request > Headers tab
5. Check Request Headers

**Expected Result:**
- [ ] `X-SendSafe-Secret` header present
- [ ] Header value matches configured shared secret
- [ ] Header is sent with every request

**Pass/Fail:** _____

---

## Category 6: Performance

### Test 6.1: Detection Speed
**Objective:** Verify detection completes in reasonable time

**Steps:**
1. Compose new email
2. Paste AI-generated text
3. Use browser DevTools > Network tab to measure time
4. Note time from paste to notification

**Expected Result:**
- [ ] Typical detection time: 2-5 seconds
- [ ] Maximum time: 10 seconds (then timeout)
- [ ] User sees notification quickly

**Acceptable:** ≤ 5 seconds typical, ≤ 10 seconds maximum

**Actual Time:** _____ seconds

**Pass/Fail:** _____

---

### Test 6.2: Memory Usage
**Objective:** Verify extension doesn't use excessive memory

**Steps:**
1. Open Chrome Task Manager (Shift+Esc)
2. Find "Extension: SendSafe" process
3. Perform 10-20 paste operations
4. Check memory usage over time

**Expected Result:**
- [ ] Memory usage < 50 MB while active
- [ ] No significant memory leaks after multiple pastes
- [ ] Memory stable after 20+ operations

**Actual Memory:** _____ MB

**Pass/Fail:** _____

---

### Test 6.3: Gmail Performance Impact
**Objective:** Verify extension doesn't slow down Gmail

**Steps:**
1. Open Gmail with extension enabled
2. Measure page load time (DevTools > Performance)
3. Disable extension
4. Reload Gmail and measure again
5. Compare load times

**Expected Result:**
- [ ] Gmail load time increase < 200ms
- [ ] No noticeable lag when typing or scrolling
- [ ] Gmail feels responsive

**Pass/Fail:** _____

---

## Category 7: Browser Compatibility

### Test 7.1: Chrome Extension Loads Successfully
**Objective:** Verify extension loads without errors

**Steps:**
1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Load unpacked extension
4. Check for errors

**Expected Result:**
- [ ] Extension loads successfully
- [ ] No errors displayed on extension card
- [ ] Extension icon appears in toolbar
- [ ] Service worker status: "active"

**Pass/Fail:** _____

---

### Test 7.2: Manifest V3 Compliance
**Objective:** Verify extension follows Manifest V3 standards

**Steps:**
1. Check `manifest.json` has `"manifest_version": 3`
2. Verify service worker (not background page) is used
3. Check permissions are minimal

**Expected Result:**
- [ ] `manifest_version` is 3
- [ ] `background.service_worker` specified (not `background.page`)
- [ ] Minimal permissions requested (notifications, Gmail host only)

**Pass/Fail:** _____

---

### Test 7.3: Backend Connectivity from Extension (Host Permissions / Networking)
**Objective:** Verify the extension background can successfully call the backend API

**Steps:**
1. Confirm `extension/src/config.ts` points to the correct backend URL
2. Open Gmail and compose a new email
3. Open the background Service Worker console:
   - Go to `chrome://extensions/`
   - Find SendSafe
   - Click the **Service worker** link
4. Paste AI-generated text with traces into the email body
5. In the Service Worker DevTools:
   - Check Console for “Calling backend API” logs
   - Check Network tab for a `POST` request to `/api/check-ai-traces`

**Expected Result:**
- [ ] A backend request is made from the extension (Service Worker context)
- [ ] The request returns HTTP 200 (when backend is running and configured)
- [ ] No permission/network errors block the request

**Pass/Fail:** _____

---

## Category 8: User Experience

### Test 8.1: Notification Visibility
**Objective:** Verify notifications are clear and visible

**Steps:**
1. Paste AI-generated text with multiple trace categories
2. Observe notification appearance

**Expected Result:**
- [ ] Notification is clearly visible
- [ ] Title is attention-grabbing
- [ ] Message is concise and informative
- [ ] Lists detected categories clearly
- [ ] Can be dismissed easily

**Pass/Fail:** _____

---

### Test 8.2: Non-Blocking Behavior
**Objective:** Verify extension never prevents email sending

**Steps:**
1. Compose email
2. Paste AI-generated text
3. While notification is visible, click "Send" button

**Expected Result:**
- [ ] Email sends successfully
- [ ] Extension does not block or intercept send
- [ ] Notification is informational only, not blocking

**Pass/Fail:** _____

---

### Test 8.3: No Interference with Gmail Features
**Objective:** Verify extension doesn't break Gmail functionality

**Steps:**
1. Test Gmail autocomplete/suggestions while extension is active
2. Test Gmail's built-in spell check
3. Test inserting images, links, attachments
4. Test formatting toolbar (bold, italic, lists)

**Expected Result:**
- [ ] All Gmail features work normally
- [ ] No conflicts or errors
- [ ] Extension runs in background without interference

**Pass/Fail:** _____

---

### Test 8.4: Notification Content + Dismiss Behavior
**Objective:** Verify notification content is understandable and behaves as expected

**Steps:**
1. Paste AI-generated text with traces (use Test 1.1)
2. Observe the warning notification
3. Dismiss the notification (click the X or dismiss action in your OS notification center)

**Expected Result:**
- [ ] Notification title clearly indicates a SendSafe warning
- [ ] Message includes confidence and category summary (where available)
- [ ] Notification can be dismissed
- [ ] Gmail remains usable throughout

**Pass/Fail:** _____

---

## Category 9: Backend API Testing

### Test 9.1: Valid Request with AI Traces
**Objective:** Verify backend correctly analyzes content with AI traces

**Steps:**
1. Send POST request to backend endpoint
2. Include valid shared secret header
3. Include text with AI traces in body

**Example (curl):**
```bash
curl -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -H "X-SendSafe-Secret: your-shared-secret" \
  -d '{"text": "Sure, here is your email:\n\nHello [Your Name],\n\nThanks!"}'
```

**Expected Result:**
- [ ] HTTP 200 status
- [ ] Response JSON with `aiFlag: true`
- [ ] `categoriesFound` array populated
- [ ] `indicators` array with detected traces

**Pass/Fail:** _____

---

### Test 9.2: Valid Request with Clean Content
**Objective:** Verify backend correctly identifies clean content

**Steps:**
1. Send POST request with human-written email

```bash
curl -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -H "X-SendSafe-Secret: your-shared-secret" \
  -d '{"text": "Hi John, Thanks for your email. Let me know when you are free. Best, Sarah"}'
```

**Expected Result:**
- [ ] HTTP 200 status
- [ ] Response JSON with `aiFlag: false`
- [ ] `categoriesFound` array empty
- [ ] `indicators` array empty

**Pass/Fail:** _____

---

### Test 9.3: Missing Shared Secret (401/403)
**Objective:** Verify backend rejects unauthorized requests

**Steps:**
1. Send POST request WITHOUT shared secret header

```bash
curl -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -d '{"text": "Test content"}'
```

**Expected Result:**
- [ ] HTTP 401 or 403 status
- [ ] Error message returned
- [ ] Request rejected (not processed)

**Pass/Fail:** _____

---

### Test 9.4: Invalid Shared Secret (401/403)
**Objective:** Verify backend rejects requests with wrong secret

**Steps:**
1. Send POST request with WRONG shared secret

```bash
curl -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -H "X-SendSafe-Secret: wrong-secret-123" \
  -d '{"text": "Test content"}'
```

**Expected Result:**
- [ ] HTTP 401 or 403 status
- [ ] Error message returned
- [ ] Request rejected

**Pass/Fail:** _____

---

### Test 9.5: Missing Text Field (400)
**Objective:** Verify backend validates request body

**Steps:**
1. Send POST request without `text` field

```bash
curl -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -H "X-SendSafe-Secret: your-shared-secret" \
  -d '{}'
```

**Expected Result:**
- [ ] HTTP 400 status
- [ ] Error message: "Missing or invalid text field" or similar
- [ ] Request rejected

**Pass/Fail:** _____

---

### Test 9.6: Empty Text (400)
**Objective:** Verify backend rejects empty text

**Steps:**
1. Send POST request with empty or whitespace-only text

```bash
curl -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -H "X-SendSafe-Secret: your-shared-secret" \
  -d '{"text": "   "}'
```

**Expected Result:**
- [ ] HTTP 400 status
- [ ] Error message about empty text
- [ ] Request rejected (no OpenAI call made)

**Pass/Fail:** _____

---

### Test 9.7: Rate Limit Exceeded (429)
**Objective:** Verify backend enforces rate limits

**Steps:**
1. Make 11 requests in quick succession from same IP

**Expected Result:**
- [ ] First 10 requests succeed (HTTP 200)
- [ ] 11th request fails with HTTP 429
- [ ] Error message: "Rate limit exceeded" or similar

**Pass/Fail:** _____

---

### Test 9.8: OPTIONS Preflight (CORS)
**Objective:** Verify backend handles browser preflight requests correctly

**Steps:**
1. Send an `OPTIONS` request to the backend endpoint:

```bash
curl -i -X OPTIONS https://your-backend.vercel.app/api/check-ai-traces
```

**Expected Result:**
- [ ] HTTP 200 status
- [ ] Response includes CORS headers (e.g., `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`)

**Pass/Fail:** _____

---

### Test 9.9: Method Not Allowed (GET → 405)
**Objective:** Verify backend rejects unsupported HTTP methods

**Steps:**
1. Send a `GET` request to the backend endpoint:

```bash
curl -i https://your-backend.vercel.app/api/check-ai-traces
```

**Expected Result:**
- [ ] HTTP 405 status
- [ ] JSON error response indicating method not allowed

**Pass/Fail:** _____

---

### Test 9.10: Rate Limit Headers Present
**Objective:** Verify backend includes rate-limit headers on responses

**Steps:**
1. Make a valid request (use Test 9.2)
2. Inspect response headers (use `curl -i`):

```bash
curl -i -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -H "X-SendSafe-Secret: your-shared-secret" \
  -d '{"text": "Hi John, thanks for the update. Best, Sarah"}'
```

**Expected Result:**
- [ ] Headers include:
  - [ ] `X-RateLimit-Limit`
  - [ ] `X-RateLimit-Remaining`
  - [ ] `X-RateLimit-Reset`
- [ ] On 429 responses, `Retry-After` header is present

**Pass/Fail:** _____

---

### Test 9.11: Invalid JSON Body (400)
**Objective:** Verify backend rejects malformed JSON requests gracefully

**Steps:**
1. Send a request with invalid JSON:

```bash
curl -i -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -H "X-SendSafe-Secret: your-shared-secret" \
  -d '{not valid json}'
```

**Expected Result:**
- [ ] Request fails (not 200)
- [ ] Backend returns a clear error response (typically 400)
- [ ] Backend does not crash or return secrets

**Pass/Fail:** _____

---

### Test 9.12: Invalid Content-Type (Should Fail Cleanly)
**Objective:** Verify backend handles unexpected content types without crashing

**Steps:**
1. Send a request with a non-JSON content type:

```bash
curl -i -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: text/plain" \
  -H "X-SendSafe-Secret: your-shared-secret" \
  -d 'Hello world'
```

**Expected Result:**
- [ ] Request fails (not 200)
- [ ] Backend returns an error response (400/415 are acceptable depending on environment)
- [ ] Backend does not crash or return secrets

**Pass/Fail:** _____

---

### Test 9.13: Very Long Text via API (Should Succeed + Be Sanitized)
**Objective:** Verify backend can accept long text and sanitize/truncate safely

**Steps:**
1. Send a large text payload (example uses Python to generate long text):

```bash
python - << "PY"
text = "Sure, here's your email:\\n\\n" + ("A" * 7000) + "\\n\\n[Your Name]"
import json
print(json.dumps({"text": text}))
PY
```

2. Use the printed JSON as the request body:

```bash
curl -i -X POST https://your-backend.vercel.app/api/check-ai-traces \
  -H "Content-Type: application/json" \
  -H "X-SendSafe-Secret: your-shared-secret" \
  -d @-
```

**Expected Result:**
- [ ] HTTP 200 status (request is processed)
- [ ] Response is valid JSON and includes `aiFlag`, `confidence`, `categoriesFound`, `indicators`, `reasoning`
- [ ] Backend logs indicate sanitization/truncation occurred (check local/Vercel logs; should NOT log full pasted text)

**Pass/Fail:** _____

---

## Summary

**Total Tests:** 59  
**Tests Passed:** _____  
**Tests Failed:** _____  
**Pass Rate:** _____%

### Critical Issues Found:
_____________________________________
_____________________________________
_____________________________________

### Minor Issues Found:
_____________________________________
_____________________________________
_____________________________________

### Notes:
_____________________________________
_____________________________________
_____________________________________

---

## Sign-Off

**Tester Name:** _____________________  
**Date:** _____________________  
**Version Tested:** _____________________  
**Environment:** Local / Staging / Production  
**Overall Assessment:** Pass / Fail / Pass with Issues  

**Ready for Deployment:** Yes / No

**Additional Comments:**
_____________________________________
_____________________________________
_____________________________________

