// ============================================================================
// OpenAI Client Module
// ============================================================================
// This file handles all communication with OpenAI's API.
//
// WHAT DOES THIS DO?
// - Creates a client to talk to OpenAI
// - Sends text with our detection prompt
// - Gets back AI analysis results
// - Handles errors and timeouts
//
// WHY A SEPARATE FILE?
// - Keeps OpenAI logic isolated
// - Easy to test
// - Easy to switch AI providers if needed
// ============================================================================

// Import the official OpenAI library
// This is a package we installed with: npm install openai
import OpenAI from 'openai';

// Import our configuration
import { config } from './config';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * The result we get back from OpenAI
 * 
 * OpenAI returns a complex object with lots of information.
 * We only care about a few key fields.
 */
export interface OpenAIResponse {
  content: string;              // The AI's text response
  finishReason: string;         // Why it stopped (e.g., "stop" means completed normally)
  tokensUsed: {                 // How much of OpenAI's resources we used
    prompt: number;             // Tokens in our prompt
    completion: number;         // Tokens in AI's response
    total: number;              // Sum of both
  };
}

/**
 * Options for calling OpenAI
 * These let us customize each request
 */
export interface CallOpenAIOptions {
  systemPrompt: string;         // Instructions telling AI what to do
  userText: string;             // The text to analyze
  temperature?: number;         // Creativity level (0 = focused, 1 = creative)
  maxTokens?: number;           // Maximum length of response
}

// ---------------------------------------------------------------------------
// Create OpenAI Client
// ---------------------------------------------------------------------------

/**
 * The OpenAI client instance
 * 
 * WHAT IS AN INSTANCE?
 * Think of it like a phone connection to OpenAI.
 * We set it up once, then use it for all our calls.
 * 
 * The 'new OpenAI()' creates this connection using our API key
 */
const openaiClient = new OpenAI({
  apiKey: config.openai.apiKey,       // Our secret key from environment variables
});

// ---------------------------------------------------------------------------
// Detection Prompt (Our "Secret Sauce")
// ---------------------------------------------------------------------------

/**
 * The system prompt that tells OpenAI how to detect AI-generated text
 * 
 * WHY KEEP THIS ON THE SERVER?
 * - This is our methodology for detection
 * - If public, people could learn to bypass it
 * - We can improve it without users updating their extension
 * 
 * PROMPT ENGINEERING:
 * The way we phrase this prompt affects the quality of results.
 * We're asking OpenAI to:
 * 1. Act as an expert detector
 * 2. Look for specific markers
 * 3. Return results in a structured format (JSON)
 */
export const AI_DETECTION_PROMPT = `You are an expert Forensic Content Analyzer specializing in identifying "Copy-Paste Artifacts" from Large Language Models (LLMs) in email communications.

Your task is to analyze the provided email text to determine if it was copied directly from an AI interface (ChatGPT, Claude, Gemini, etc.) without proper editing.

Detection Criteria - Look for these 5 categories of Copy-Paste Artifacts:

1. **Bracketed Placeholders**: Identify any generic template markers like [...], {...}, <...>, or (...) containing instructional text (e.g., [Your Name], {Company}, [Insert Date Here]).

2. **Introductory Remnants**: Detect conversational "buffer" text where the AI acknowledges the user's request (e.g., "Sure, here is the draft," "I'd be happy to help," "Based on your requirements...").

3. **Markdown Artifacts**: Look for raw syntax that failed to render, such as triple backticks (\`\`\`), lone hashtags for headers (#, ##, ###), asterisks used for bolding (**text**), underscores for italics (_text_), or unrendered links [text](url).

4. **Self-Referential Phrases**: Flag any text where the sender identifies as an AI, a language model, or mentions lack of physical agency (e.g., "As an AI," "I'm a language model," "I don't have a calendar, but...").

5. **Conclusion/Outro Text**: Detect "Helpful Assistant" closing remarks that exist outside the email's formal sign-off (e.g., "Let me know if you need further edits," "I hope this meets your needs!", "Feel free to modify this as needed").

Output Format:
Respond ONLY with a valid JSON object in this exact format:

{
  "aiFlag": true or false,
  "confidence": "low" | "medium" | "high",
  "categoriesFound": ["category1", "category2", ...],
  "indicators": [
    {
      "type": "category name",
      "snippet": "exact text from email",
      "explanation": "why this is a copy-paste artifact"
    }
  ],
  "reasoning": "Brief explanation of your determination"
}

If NO copy-paste artifacts are detected, return:
{
  "aiFlag": false,
  "confidence": "high",
  "categoriesFound": [],
  "indicators": [],
  "reasoning": "No copy-paste artifacts detected. Text appears to be original email content."
}

Be thorough and precise. Focus specifically on artifacts that indicate text was copied from an AI interface, not just whether the content might be AI-generated. Look for exact matches to the 5 categories above.`;

// ---------------------------------------------------------------------------
// Main OpenAI Call Function
// ---------------------------------------------------------------------------

/**
 * Calls OpenAI to analyze text for AI generation markers
 * 
 * HOW THIS WORKS:
 * 1. Take our detection prompt + user's text
 * 2. Send to OpenAI with a timeout
 * 3. Wait for response (or timeout)
 * 4. Extract and return the key information
 * 
 * @param options - Configuration for this specific call
 * @returns OpenAIResponse with analysis results
 * @throws Error if OpenAI call fails or times out
 */
export async function callOpenAI(options: CallOpenAIOptions): Promise<OpenAIResponse> {
  // Destructure options (pull out the fields we need)
  // The || provides default values if not specified
  const {
    systemPrompt,
    userText,
    temperature = 0.3,        // Lower = more focused/consistent
    maxTokens = 1000,         // Limit response length
  } = options;
  
  // -------------------------------------------------------------------------
  // Create timeout promise
  // -------------------------------------------------------------------------
  // We don't want to wait forever for OpenAI
  // This creates a promise that rejects after the configured timeout
  
  /**
   * WHAT IS A PROMISE?
   * A promise represents a value that will arrive in the future.
   * Like ordering food: you get a receipt (promise) now, food (value) later.
   * 
   * Promises can:
   * - Resolve (succeed) with a value
   * - Reject (fail) with an error
   */
  const timeoutPromise = new Promise<never>((_, reject) => {
    // setTimeout runs code after a delay (in milliseconds)
    setTimeout(() => {
      reject(new Error(
        `OpenAI request timed out after ${config.openai.timeout}ms`
      ));
    }, config.openai.timeout);
  });
  
  // -------------------------------------------------------------------------
  // Create OpenAI request promise
  // -------------------------------------------------------------------------
  const openaiPromise = openaiClient.chat.completions.create({
    // Which AI model to use
    model: config.openai.model,
    
    // The messages to send
    // OpenAI uses a "chat" format with roles: system, user, assistant
    messages: [
      {
        role: 'system',         // System message sets the AI's behavior/instructions
        content: systemPrompt,
      },
      {
        role: 'user',           // User message is the actual content to analyze
        content: userText,
      },
    ],
    
    // Temperature controls randomness/creativity
    // 0 = very focused, deterministic
    // 1 = very creative, varied
    // We use 0.3 for consistent detection results
    temperature,
    
    // Maximum tokens in the response
    // Tokens are roughly word-pieces (1 token ≈ 0.75 words)
    max_tokens: maxTokens,
    
    // We want JSON response
    // This tells OpenAI to be extra careful to return valid JSON
    response_format: { type: 'json_object' },
  });
  
  // -------------------------------------------------------------------------
  // Race the two promises
  // -------------------------------------------------------------------------
  /**
   * Promise.race() takes multiple promises and returns when the FIRST one finishes
   * 
   * Like a race: whoever finishes first wins
   * - If OpenAI responds quickly: we get the response
   * - If timeout hits first: we get a timeout error
   * 
   * This ensures we never wait longer than our configured timeout
   */
  try {
    const response = await Promise.race([
      openaiPromise,
      timeoutPromise,
    ]);
    
    // -----------------------------------------------------------------------
    // Extract key information from response
    // -----------------------------------------------------------------------
    // OpenAI returns a complex object. We need to carefully extract what we need.
    
    // Get the first choice (OpenAI can return multiple responses, we just want one)
    const choice = response.choices[0];
    
    // Safety check: make sure we got a response
    if (!choice || !choice.message || !choice.message.content) {
      throw new Error('OpenAI returned an empty or invalid response');
    }
    
    // Extract the content (the AI's text response)
    const content = choice.message.content;
    
    // Extract finish reason (why the AI stopped)
    // Possible values: "stop" (completed), "length" (hit token limit), "content_filter" (blocked)
    const finishReason = choice.finish_reason || 'unknown';
    
    // Extract token usage information
    // This tells us how much we used (and therefore how much it cost)
    const usage = response.usage;
    const tokensUsed = {
      prompt: usage?.prompt_tokens || 0,
      completion: usage?.completion_tokens || 0,
      total: usage?.total_tokens || 0,
    };
    
    // Return structured response
    return {
      content,
      finishReason,
      tokensUsed,
    };
    
  } catch (error) {
    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------
    // If anything goes wrong, we need to throw a clear error message
    
    // Check if error is an Error object (TypeScript safety)
    if (error instanceof Error) {
      // If it's our timeout error, throw it as-is
      if (error.message.includes('timed out')) {
        throw error;
      }
      
      // If it's an OpenAI error, provide helpful context
      throw new Error(
        `OpenAI API call failed: ${error.message}`
      );
    }
    
    // Unknown error type
    throw new Error(
      `OpenAI API call failed with unknown error: ${String(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Convenience Function for AI Detection
// ---------------------------------------------------------------------------

/**
 * Simplified function specifically for detecting AI-generated text
 * Uses our standard detection prompt
 * 
 * This is what the API endpoint will actually call
 * 
 * @param text - The text to analyze
 * @returns OpenAIResponse with detection results
 */
export async function detectAIContent(text: string): Promise<OpenAIResponse> {
  return callOpenAI({
    systemPrompt: AI_DETECTION_PROMPT,
    userText: text,
    temperature: 0.3,           // Consistent detection
    maxTokens: 1000,           // Enough for detailed response
  });
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Estimates the cost of a request based on tokens used
 * 
 * PRICING (as of current rates, may change):
 * GPT-4o-mini:
 * - Input: $0.150 per 1M tokens
 * - Output: $0.600 per 1M tokens
 * 
 * @param tokensUsed - Token usage from OpenAI response
 * @returns Estimated cost in USD
 */
export function estimateRequestCost(tokensUsed: OpenAIResponse['tokensUsed']): number {
  // These are approximate rates for gpt-4o-mini
  // Rates differ by model - check OpenAI's pricing page
  const INPUT_COST_PER_MILLION = 0.150;     // $0.150 per 1M input tokens
  const OUTPUT_COST_PER_MILLION = 0.600;    // $0.600 per 1M output tokens
  
  // Calculate costs
  const inputCost = (tokensUsed.prompt / 1_000_000) * INPUT_COST_PER_MILLION;
  const outputCost = (tokensUsed.completion / 1_000_000) * OUTPUT_COST_PER_MILLION;
  
  // Return total cost
  return inputCost + outputCost;
}

/**
 * Checks if we're using a valid model
 * Useful for configuration validation
 * 
 * @param model - Model name to check
 * @returns true if model is recognized
 */
export function isValidModel(model: string): boolean {
  // List of OpenAI models that support JSON mode and work for our use case
  const validModels = [
    'gpt-4o-mini',      // Recommended for MVP - cost-effective
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
    'gpt-3.5-turbo',
  ];
  
  return validModels.includes(model);
}

// ---------------------------------------------------------------------------
// Example Usage (for documentation)
// ---------------------------------------------------------------------------

/*
EXAMPLE USAGE:

const response = await detectAIContent("This is sample text to analyze.");

console.log(response.content);        // JSON string with detection results
console.log(response.finishReason);   // "stop" if completed normally
console.log(response.tokensUsed);     // { prompt: 150, completion: 100, total: 250 }

const cost = estimateRequestCost(response.tokensUsed);
console.log(`Request cost: $${cost.toFixed(6)}`);  // e.g., "$0.000045"
*/

