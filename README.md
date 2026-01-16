# SendSafe

**Protect your professional reputation by catching AI-generated content before you hit send.**

SendSafe is a Chrome extension that automatically checks pasted text in Gmail for signs of AI generation, helping you maintain authentic communication in professional settings.

---

## What Does SendSafe Do?

SendSafe watches for when you paste text into Gmail. When it detects a paste, it:

1. **Captures** the pasted text
2. **Sends** it to a secure backend server for analysis
3. **Analyzes** the text using OpenAI's advanced language models
4. **Alerts** you if AI-generated patterns are detected
5. **Shows** you what categories of AI markers were found

All of this happens automatically in seconds, giving you peace of mind before sending important emails.

---

## Why SendSafe?

In academic and professional settings, using AI-generated content without disclosure can have serious consequences:
- **Academic integrity violations** for students
- **Loss of professional credibility** for researchers and consultants
- **Miscommunication** when AI doesn't capture your authentic voice
- **Unintended plagiarism** from AI training data

SendSafe acts as your safety net, catching potential issues before they become problems.

---

## How It Works (Simple Explanation)

Think of SendSafe like having a helpful assistant looking over your shoulder:

1. **You paste text** into Gmail (maybe from a document, chat, or another source)
2. **SendSafe notices** the paste and captures the text
3. **Behind the scenes**, the text is sent to our secure server
4. **AI analysis** checks for patterns that suggest AI generation
5. **You get notified** if anything suspicious is found (otherwise, no interruption!)

**Important:** SendSafe only warns you - it never blocks you from sending emails. You stay in control.

---

## Features

- ✅ **Automatic Detection** - Works seamlessly as you paste into Gmail
- ✅ **Fast Analysis** - Results in under 10 seconds
- ✅ **Privacy-Focused** - Text is analyzed and immediately discarded, never stored
- ✅ **Non-Intrusive** - Only shows alerts when AI traces are found
- ✅ **Detailed Feedback** - Shows specific categories of AI markers detected
- ✅ **Gmail-Only** - Doesn't run on other websites, respecting your privacy

---

## Installation

### For Users (Chrome Web Store)
*Coming soon - extension will be available on the Chrome Web Store*

### For Developers (Local Testing)

#### Prerequisites
- Google Chrome browser
- Node.js (version 18 or higher)
- An OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- Vercel account (free tier works fine)

#### Backend Setup

1. **Clone this repository:**
   ```bash
   git clone <repository-url>
   cd SendSafe
   ```

2. **Navigate to backend folder:**
   ```bash
   cd backend
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Create environment file:**
   ```bash
   # Copy the example file
   cp env.example .env
   
   # Edit .env and fill in your actual values:
   # - Add your OpenAI API key
   # - Set model to gpt-4o-mini (or your preferred model)
   # - Generate a random shared secret
   # - Adjust other settings if desired
   ```

5. **Run locally:**
   ```bash
   npm run dev
   ```
   
   The backend will be available at `http://localhost:3000`

6. **Deploy to Vercel:**
   ```bash
   # Install Vercel CLI if you haven't
   npm install -g vercel
   
   # Deploy
   vercel
   
   # Add environment variables in Vercel dashboard
   # Copy all variables from your .env file
   ```

#### Extension Setup

1. **Update extension config:**
   ```bash
   cd extension/src
   # Edit config.ts and set:
   # - BACKEND_URL to your Vercel deployment URL (or localhost for testing)
   # - SHARED_SECRET to match your backend secret
   ```

2. **Load extension in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension/` folder
   - The SendSafe icon should appear in your toolbar

3. **Test it:**
   - Go to Gmail
   - Compose a new email
   - Paste some AI-generated text (try ChatGPT output)
   - You should see a notification if AI traces are detected!

---

## Architecture

SendSafe has two main components:

### Chrome Extension (Frontend)
- **Technology:** TypeScript, Chrome Extension Manifest V3
- **What it does:**
  - Runs a content script on Gmail pages
  - Listens for paste events in compose boxes
  - Sends text to backend for analysis
  - Displays notifications based on results
- **Location:** `extension/` folder

### Backend API (Server)
- **Technology:** TypeScript, Node.js, Vercel Serverless Functions
- **What it does:**
  - Receives text from extension
  - Validates requests (shared secret, rate limiting)
  - Calls OpenAI API for analysis
  - Returns structured results
- **Location:** `backend/` folder

### Data Flow
```
Gmail Page (User pastes)
    ↓
Content Script (Captures text)
    ↓
Background Service Worker (Makes API call)
    ↓
Backend API (Validates request)
    ↓
OpenAI API (Analyzes text)
    ↓
Backend API (Formats response)
    ↓
Extension (Shows notification)
```

---

## Privacy & Security

**We take your privacy seriously:**

- ✅ **No Storage** - Pasted text is analyzed and immediately discarded
- ✅ **No Logging** - Email content is never logged on our servers
- ✅ **Secure Transmission** - All data sent over HTTPS
- ✅ **Minimal Permissions** - Extension only has access to Gmail, nothing else
- ✅ **API Key Protection** - Your OpenAI key stays safely on the server
- ✅ **Rate Limiting** - Prevents abuse and controls costs

**What data is processed:**
- Text you paste into Gmail (temporarily, for analysis only)
- Your IP address (for rate limiting only)

**What data is NOT collected:**
- Email recipients
- Email subjects
- Full email content (only pasted portions)
- Personal information
- Browsing history

For full details, see our [Privacy Policy](docs/privacy-policy.md).

---

## Development

### Project Structure
```
SendSafe/
├── backend/                  # Backend API
│   ├── api/                 # API endpoints
│   │   └── check-ai-traces.ts
│   ├── lib/                 # Shared utilities
│   │   ├── config.ts
│   │   ├── openaiClient.ts
│   │   ├── parseDetectionResult.ts
│   │   ├── rateLimit.ts
│   │   └── sanitizeInput.ts
│   ├── package.json
│   ├── vercel.json
│   └── tsconfig.json
├── extension/               # Chrome extension
│   ├── src/
│   │   ├── contentScript.ts    # Runs in Gmail
│   │   ├── background.ts       # Service worker
│   │   └── config.ts           # Extension settings
│   ├── assets/
│   │   └── icons/              # Extension icons
│   └── manifest.json           # Extension manifest
├── docs/                    # Documentation
│   └── privacy-policy.md
├── CONFIG_STRATEGY.md       # Configuration guide
├── DEVELOPMENT_LOG.md       # Development progress notes
└── README.md               # This file
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run specific test file
npm test api/check-ai-traces.test.ts
```

### Key Technologies

- **TypeScript** - Type-safe JavaScript
- **Node.js** - JavaScript runtime for backend
- **Vercel** - Serverless hosting platform
- **OpenAI API** - AI text analysis
- **Chrome Extensions API** - Browser extension framework
- **Jest** - Testing framework

---

## Configuration

See [CONFIG_STRATEGY.md](CONFIG_STRATEGY.md) for detailed information about:
- What settings go where (backend vs extension)
- Why secrets must stay on the server
- Environment variables reference
- Security best practices

---

## Roadmap

### MVP (Current Phase)
- [x] Basic paste detection in Gmail
- [x] Backend API with OpenAI integration
- [x] Simple notifications for detected AI content
- [ ] Rate limiting
- [ ] Chrome Web Store submission

### Future Enhancements
- [ ] User authentication (replace shared secret)
- [ ] User dashboard (view history, settings)
- [ ] Whitelist trusted sources
- [ ] Confidence scores (how sure we are it's AI)
- [ ] Support for more email providers (Outlook, etc.)
- [ ] Custom detection sensitivity settings
- [ ] Detailed AI marker explanations
- [ ] Browser extension for Firefox and Edge

---

## Contributing

This is currently a private project in development. Contribution guidelines will be added when the project goes public.

---

## Support

For issues, questions, or feedback:
- Create an issue in this repository
- Email: [your-email@example.com]

---

## License

MIT License - See LICENSE file for details

---

## Acknowledgments

- OpenAI for their powerful language models
- The Chrome Extensions team for excellent documentation
- Vercel for reliable serverless hosting

---

**Made with care to help maintain authentic communication in the AI age.**

