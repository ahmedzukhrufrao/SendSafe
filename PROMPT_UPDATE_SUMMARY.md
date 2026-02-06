# System Prompt Update Summary

## Date: January 15, 2026

## Changes Made

Updated the AI detection system prompt to match the PRD specifications while keeping the JSON output format for easy parsing.

---

## What Was Changed

### 1. **Detection Prompt (openaiClient.ts)**

**Old Approach:**
- Generic AI-generated text detection
- 8 categories of general AI writing patterns
- Focus on writing style and tone

**New Approach (PRD-Aligned):**
- **Forensic Content Analyzer** specializing in "Copy-Paste Artifacts"
- **5 specific categories** from the PRD:
  1. Bracketed Placeholders
  2. Introductory Remnants
  3. Markdown Artifacts
  4. Self-Referential Phrases
  5. Conclusion/Outro Text
- Focus on artifacts indicating text was **copied directly from AI interface**

### 2. **Response Structure (parseDetectionResult.ts)**

**Old Fields:**
```typescript
{
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}
```

**New Fields (PRD-Aligned):**
```typescript
{
  type: string;
  snippet: string;      // Exact text from email
  explanation: string;  // Why this is an artifact
}
```

**Why:** Better matches PRD requirement to show "exact snippet from text" with explanations.

---

## Updated Files

| File | What Changed | Lines |
|------|--------------|-------|
| `backend/lib/openaiClient.ts` | Complete prompt rewrite | 92-130 |
| `backend/lib/parseDetectionResult.ts` | Interface and parsing logic updates | 24-28, 46-54, 159-179, 287-299, 305-345 |

---

## The New Detection Prompt

```
You are an expert Forensic Content Analyzer specializing in identifying 
"Copy-Paste Artifacts" from Large Language Models (LLMs) in email communications.

Your task is to analyze the provided email text to determine if it was copied 
directly from an AI interface (ChatGPT, Claude, Gemini, etc.) without proper editing.

Detection Criteria - Look for these 5 categories of Copy-Paste Artifacts:

1. Bracketed Placeholders: [...], {...}, <...>, (...)
2. Introductory Remnants: "Sure, here is the draft..."
3. Markdown Artifacts: ```, **, ##, [text](url)
4. Self-Referential Phrases: "As an AI...", "I'm a language model..."
5. Conclusion/Outro Text: "Let me know if you need edits..."

Output Format: JSON
{
  "aiFlag": true or false,
  "confidence": "low" | "medium" | "high",
  "categoriesFound": ["category1", ...],
  "indicators": [
    {
      "type": "category name",
      "snippet": "exact text from email",
      "explanation": "why this is a copy-paste artifact"
    }
  ],
  "reasoning": "Brief explanation"
}
```

---

## Benefits of This Approach

### ✅ Aligned with PRD
- Uses exact detection criteria from PRD
- Matches the 5 categories specified
- Focuses on copy-paste artifacts vs general AI writing

### ✅ Better Accuracy
- More specific detection targets
- Less likely to flag naturally formal human writing
- Focuses on obvious "forgot to edit" mistakes

### ✅ Easy to Parse
- JSON format is structured and reliable
- No complex regex parsing needed
- TypeScript types ensure correctness

### ✅ Clear User Feedback
- Exact snippets shown to users
- Clear explanations of what's wrong
- Actionable feedback for corrections

---

## Example Detection

**Input Text:**
```
Sure, here's a professional email for you:

Dear [Recipient Name],

I hope this message finds you well. I wanted to reach out regarding 
the upcoming project deadline.

Best regards,
[Your Name]

Let me know if you need any edits!
```

**Output:**
```json
{
  "aiFlag": true,
  "confidence": "high",
  "categoriesFound": [
    "Introductory Remnants",
    "Bracketed Placeholders",
    "Conclusion/Outro Text"
  ],
  "indicators": [
    {
      "type": "Introductory Remnants",
      "snippet": "Sure, here's a professional email for you:",
      "explanation": "This acknowledges the user's request and reveals the content was AI-generated"
    },
    {
      "type": "Bracketed Placeholders",
      "snippet": "[Recipient Name]",
      "explanation": "Template placeholder that needs to be replaced with actual name"
    },
    {
      "type": "Bracketed Placeholders",
      "snippet": "[Your Name]",
      "explanation": "Template placeholder that needs to be replaced with actual name"
    },
    {
      "type": "Conclusion/Outro Text",
      "snippet": "Let me know if you need any edits!",
      "explanation": "AI assistant's closing remark that doesn't belong in the email"
    }
  ],
  "reasoning": "Multiple copy-paste artifacts detected indicating text was copied directly from AI interface without editing"
}
```

---

## Testing Recommendations

### Test Case 1: All 5 Categories
Paste text containing all 5 artifact types to verify each is detected.

### Test Case 2: Human-Written Email
Paste a genuine human email to ensure no false positives.

### Test Case 3: Partially Edited AI Text
Paste AI-generated text where some placeholders were replaced but others weren't.

### Test Case 4: Legitimate Markdown
Paste email with intentional formatting like "**bold**" in a technical context to see if it's correctly identified.

### Test Case 5: Empty/Whitespace
Verify empty pastes don't trigger API calls.

---

## Backward Compatibility

**Breaking Changes:**
- Response structure changed (severity → snippet + explanation)
- Any code expecting the old structure will need updates

**What Still Works:**
- JSON parsing logic
- Error handling
- Rate limiting
- All API endpoints
- Extension communication

---

## Next Steps

1. ✅ Update complete - no further code changes needed
2. 🧪 Test with sample AI-generated emails
3. 🧪 Test with human-written emails
4. 📊 Monitor detection accuracy
5. 🔄 Iterate on prompt based on real-world performance

---

## Questions or Improvements?

If detection accuracy needs tuning, we can:
- Adjust the prompt wording
- Add more specific examples
- Fine-tune confidence thresholds
- Add additional categories

The JSON output format makes it easy to iterate on the prompt without changing the parsing logic!

