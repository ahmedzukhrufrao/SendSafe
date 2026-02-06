# Chrome Web Store Listing for SendSafe

## Short Description (132 characters max)

**Current length: 131 characters**

```
Catch AI-generated text in emails before you send. Real-time detection, zero interruption. Built to save you from embarrassing mistakes.
```

---

## Single Purpose Description

SendSafe detects AI-generated text in Gmail compose windows by analyzing pasted content in real-time and notifying you when AI patterns are detected, helping you maintain an authentic voice in your communications.

---

## Detailed Description

**Current length: ~2,900 characters**

```
Hey there! 👋

I built SendSafe because I kept doing something embarrassing. I'd use ChatGPT to help draft emails, copy the response, paste it into Gmail... and accidentally send things like "Sure, here's a professional email for you:" or forget to replace "[Your Name]" with my actual name. 

Embarrassing, right?

The worst part? I'd only notice AFTER hitting send. That sinking feeling when you realize your client or boss just saw that your "thoughtful" email came straight from an AI chatbot.

So I created SendSafe to save us all from that moment.

What SendSafe Does (In Simple Terms):

SendSafe watches when you paste text into Gmail. If it spots anything that screams "this came from AI!" , it instantly shows you a notification. Think of it as a colleague tapping your shoulder saying "Hey, you might want to check that before sending."

SendSafe identifies multiple categories of AI traces from repetitive phrasing to unnatural structure. It's precise. It's reliable.

How It Works:

1. You paste your AI-drafted email into Gmail
2. SendSafe automatically checks it in less than 3 seconds (super fast!)
3. You get alerted if anything looks suspicious
4. You fix it before anyone sees
5. You send with confidence knowing your email looks 100% professional

No complicated setup. No confusing settings. Just paste and go.

Why You'll Love It:

Save Your Reputation - Never reveal your AI secret to clients, colleagues, or your boss. What they don't know won't hurt your credibility.

Works Instantly - The moment you paste, SendSafe is already checking. No waiting, no manual scanning.

Gmail-Focused- Built specifically for Gmail's compose window. Works with new emails, replies, forwards, and pop-out windows.

Privacy First - Your email content is analyzed and immediately forgotten. Nothing is stored. Nothing is saved. Your drafts stay private.

Zero Learning Curve - Install it, paste your content, and you're protected. That's it.

Who This Is For

- Professionals who use AI to draft emails but want to maintain their authentic voice
- Busy people who don't have time to carefully review every AI suggestion
- Anyone who's ever had that "oh no" moment after sending an email with AI traces

The Bottom Line:

Using AI to help write emails is smart. Accidentally revealing it is not.

SendSafe is your safety net. It catches what you miss when you're rushing, tired, or just not paying close enough attention. Your emails represent you and we care about your reputation.

Install SendSafe and paste with confidence.

Built with care by someone who's been there. Made for everyone who wants to work smarter without looking silly.


Technical Details

- Works exclusively with Gmail (gmail.com)
- Detects paste events in real-time
- Supports all Gmail compose modes
- Minimal permissions for your security
- Lightweight and fast (won't slow down Gmail)

Note: SendSafe currently supports English language content and works only in Google Chrome browser.
```

---

## Permission Justification

**For Chrome Web Store Review**

SendSafe requests access to `https://mail.google.com/*` for one simple reason: to detect when you paste text into Gmail's compose window.

Here's exactly what we do with this permission:

1. **Detect paste events** - We listen for paste actions only in Gmail compose boxes (new emails, replies, forwards).

2. **Capture pasted text** - We extract the plain text you paste (not your full email, not recipients, not subjects—just what you paste).

3. **Send for analysis** - The pasted text is sent to our secure backend for AI detection analysis.

4. **Show notifications** - If AI traces are detected, we show you a Chrome notification.

**What we DON'T do:**
- We don't read your existing emails
- We don't access your contacts
- We don't track your browsing outside Gmail
- We don't store your email content
- We don't access any other websites

SendSafe only works on Gmail. It doesn't run on other sites. It doesn't need storage permissions, camera, microphone, or location. Just Gmail access, so we can help you catch AI-generated content before you send.

---

## Remote Code Usage

**Answer: No, SendSafe does not use remote code.**

**Chrome Web Store Definition:** Remote code is any JS or Wasm that is not included in the extension's package. This includes references to external files in `<script>` tags, modules pointing to external files, and strings evaluated through `eval()`.

**SendSafe's Implementation:**
- All extension code is bundled locally in the extension package:
  - Content script: `dist/contentScript.js` (local file)
  - Background service worker: `dist/background.js` (local file)

- The extension makes HTTP API calls to our backend server using `fetch()` to send/receive **data only** (JSON responses). This is **not** remote code because:
  - We do not fetch or execute JavaScript files from the backend
  - We do not load external `.js` or `.wasm` files
  - We do not use `eval()` or `new Function()` to execute dynamic code
  - We do not use `importScripts()` or load external scripts
  - The backend returns JSON data, not executable code

**Important Distinction:** Making API calls to send/receive data (like JSON) is **not** remote code. Remote code specifically refers to fetching and executing JavaScript or WebAssembly that runs in the extension context.

All code execution happens from locally bundled files included in the extension package.

---

## Additional Notes for Store Submission

- **Category:** Productivity
- **Language:** English
- **Screenshots needed:** 1-5 screenshots showing:
  - Gmail compose window
  - Notification when AI traces are detected
  - Different scenarios (warning, error states)
  - **See `STORE_SCREENSHOTS_SPEC.md` for detailed screenshot specifications and design guidelines**
- **Privacy Policy URL:** (You'll need to host this publicly - GitHub Pages, your website, etc.)


