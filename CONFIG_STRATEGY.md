# Configuration Strategy for SendSafe

This document explains what information goes where and why. Understanding this separation is crucial for security.

## Core Security Principle: Client vs Server

**Think of it like this:**
- **Client (Extension)** = Your house's front door. Anyone can see it and examine it.
- **Server (Backend)** = Your house's safe. Hidden away, only you have the combination.

Anything in the Chrome extension can be seen by users who install it. They can:
- Look at the code
- See what values are stored
- Modify them if they want

Anything on the backend server is hidden. Users never see it.

---

## Backend Configuration (Server - Hidden & Secret)

These settings MUST stay on the backend because they're sensitive:

### 1. OpenAI API Key
- **What:** `OPENAI_API_KEY`
- **Where:** Backend environment variable (Vercel dashboard)
- **Why:** This is like your credit card - if someone steals it, they can use OpenAI on your account and you'll be charged
- **Security:** Never put this in extension code, never commit to Git
- **Example:** `sk-proj-abc123...`

### 2. OpenAI Configuration
- **What:** `OPENAI_MODEL`, `OPENAI_TIMEOUT`
- **Where:** Backend environment variables
- **Why:** We control costs and behavior from the server
- **Note:** These aren't super secret, but keeping them server-side means we can change them without updating the extension

### 3. Rate Limiting Settings
- **What:** `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MINUTES`
- **Where:** Backend environment variables
- **Why:** If users could change these, they could bypass our limits and run up costs
- **Security:** Keep server-side so only we control the limits

### 4. Detection Prompt (Instructions to OpenAI)
- **What:** The prompt telling OpenAI how to detect AI-generated text
- **Where:** Hardcoded in backend API file (`api/check-ai-traces.ts`)
- **Why:** 
  - This is our "secret sauce" - how we detect AI text
  - If public, people could learn to bypass it
  - We can improve it without users updating their extension
- **Example:** "Analyze this text and identify markers of AI generation..."

### 5. Text Processing Limits
- **What:** `MAX_TEXT_LENGTH` (maximum characters to analyze)
- **Where:** Backend environment variable
- **Why:** Controls costs and performance from server side

---

## Extension Configuration (Client - Public & Visible)

These settings go in the extension because users need them or they're not sensitive:

### 1. Backend API URL
- **What:** `BACKEND_URL`
- **Where:** `extension/src/config.ts`
- **Why:** Extension needs to know where to send requests
- **Security:** Not sensitive - this URL is public anyway
- **Example:** `https://sendsafe-api.vercel.app`

### 2. Shared Secret (MVP Only - Not Ideal)
- **What:** `SENDSAFE_SHARED_SECRET`
- **Where:** `extension/src/config.ts` (for MVP)
- **Why MVP:** 
  - Easiest to implement initially
  - Provides basic protection against random internet users
  - Good enough for testing and early users
- **Why Not Ideal:**
  - Anyone can see extension code and find the secret
  - Not true authentication
- **Future Improvement:** Use OAuth or user-specific API keys
- **Example:** `"randomly-generated-string-abc123"`

### 3. Extension Behavior Settings
- **What:** Timeouts, retry logic, UI preferences
- **Where:** `extension/src/config.ts`
- **Why:** Not sensitive, controls how extension behaves
- **Examples:**
  - `REQUEST_TIMEOUT: 15000` (15 seconds)
  - `MAX_PASTE_LENGTH: 5000` (characters)
  - `ENABLE_NOTIFICATIONS: true`

### 4. Gmail Selectors
- **What:** CSS selectors to find Gmail's compose box
- **Where:** `extension/src/contentScript.ts`
- **Why:** Extension needs these to detect paste events
- **Not sensitive:** Just targeting information
- **Example:** `div[aria-label="Message Body"]`

---

## Configuration Files Summary

### Backend Files
```
backend/
├── env.example                    # Template (committed to Git)
├── .env                          # Actual secrets (NEVER commit)
└── lib/config.ts                 # Reads from process.env
```

**env.example vs .env:**
- `env.example` - Shows WHAT variables are needed (committed to Git)
- `.env` - Contains ACTUAL secret values (never committed, in .gitignore)
- When deploying to Vercel, you enter the real values in their dashboard

### Extension Files
```
extension/
└── src/
    └── config.ts                  # All extension settings
```

---

## How Secrets Flow Through the System

### Development (Local Testing):
1. Developer creates `.env` file in `backend/` folder
2. Copies `env.example` and fills in real values
3. Backend reads from `.env` using `process.env.OPENAI_API_KEY`
4. Extension reads from `config.ts` and calls backend

### Production (Deployed):
1. Backend deployed to Vercel
2. Secrets added in Vercel dashboard (Environment Variables section)
3. Vercel automatically loads them as `process.env` variables
4. Extension updated with production backend URL
5. Extension packaged and uploaded to Chrome Web Store

### Request Flow:
```
User pastes in Gmail
    ↓
Extension detects paste
    ↓
Extension sends to backend with shared secret
    ↓
Backend validates shared secret
    ↓
Backend calls OpenAI with API key
    ↓
OpenAI returns analysis
    ↓
Backend sends result to extension
    ↓
Extension shows notification
```

**What user can see:**
- Extension code (all of it)
- Network request to backend URL
- The shared secret header (if they inspect network traffic)

**What user cannot see:**
- OpenAI API key (only on server)
- Detection prompt (only on server)
- OpenAI's responses (backend filters them)
- Rate limiting logic (only on server)

---

## Security Best Practices Implemented

### ✅ What We're Doing Right:
1. **API Key on Server:** OpenAI key never exposed to clients
2. **Server-Side Validation:** Backend checks every request
3. **Rate Limiting on Server:** Can't be bypassed by client
4. **No Sensitive Data Logging:** Don't log email content or secrets
5. **HTTPS Only:** All communication encrypted

### ⚠️ MVP Limitations (To Improve Later):
1. **Shared Secret Visible:** Anyone can find it in extension code
   - **Future Fix:** User authentication with individual API keys
2. **No Request Signing:** Can't verify request wasn't tampered with
   - **Future Fix:** HMAC signatures on requests
3. **IP-Based Rate Limiting:** Can be bypassed with VPN
   - **Future Fix:** User-based rate limiting after adding auth

---

## Environment Variables Reference

### Required Backend Variables:
| Variable | Type | Example | Required |
|----------|------|---------|----------|
| `OPENAI_API_KEY` | Secret | `sk-proj-...` | Yes |
| `OPENAI_MODEL` | Config | `gpt-4o-mini` | Yes |
| `OPENAI_TIMEOUT` | Number | `10000` | Yes |
| `SENDSAFE_SHARED_SECRET` | Secret | `random-string-123` | Yes |
| `RATE_LIMIT_MAX_REQUESTS` | Number | `10` | Yes |
| `RATE_LIMIT_WINDOW_MINUTES` | Number | `60` | Yes |
| `MAX_TEXT_LENGTH` | Number | `5000` | Yes |

### Required Extension Variables:
| Variable | Type | Example | Required |
|----------|------|---------|----------|
| `BACKEND_URL` | String | `https://api.vercel.app` | Yes |
| `SHARED_SECRET` | String | `random-string-123` | Yes |
| `REQUEST_TIMEOUT` | Number | `15000` | Yes |
| `MAX_PASTE_LENGTH` | Number | `5000` | Yes |

---

## Testing Configuration

### Local Development:
- Backend: `http://localhost:3000`
- Extension: Points to local backend
- Use `.env` file for secrets

### Production:
- Backend: `https://sendsafe-api.vercel.app` (or your domain)
- Extension: Points to production backend
- Vercel dashboard for secrets

---

## Key Takeaways

1. **Secret = Server:** Anything sensitive must stay on the backend
2. **Public = Extension OK:** Non-sensitive settings can be in extension
3. **MVP Shared Secret:** Basic protection, but not perfect - it's visible in extension code
4. **Future Auth:** Will add proper user authentication so each user has their own credentials
5. **Never Commit Secrets:** Use `.env` locally, Vercel dashboard for production

This separation keeps your OpenAI key safe while letting the extension work properly!

