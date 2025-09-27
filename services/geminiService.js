/**
 * @fileoverview A service for refining text using the Google Generative AI SDK.
 * This service takes content that has already undergone a basic find-and-replace
 * and uses a generative model to improve its contextual accuracy and flow.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { jsonrepair } = require("jsonrepair");

// --- CONFIGURATION ---
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash-latest";

if (!API_KEY) {
  console.error("❌ FATAL: GEMINI_API_KEY environment variable is not set.");
  throw new Error("GEMINI_API_KEY is not set.");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  responseMimeType: "application/json",
});

console.log(`🌍 Using Gemini Model: ${GEMINI_MODEL}`);

/**
 * Extract the first valid JSON block from Gemini output.
 * @param {string} raw
 * @returns {string}
 */
function sanitizeGeminiResponse(raw) {
  if (!raw) return raw;

  // Remove markdown code fences
  let cleaned = raw
    .replace(/^```(json|javascript)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Find first opening brace/bracket
  const firstCurly = cleaned.indexOf("{");
  const firstSquare = cleaned.indexOf("[");
  let start =
    firstCurly === -1
      ? firstSquare
      : firstSquare === -1
      ? firstCurly
      : Math.min(firstCurly, firstSquare);

  if (start > 0) cleaned = cleaned.slice(start);

  // Cut after last closing brace/bracket
  const lastCurly = cleaned.lastIndexOf("}");
  const lastSquare = cleaned.lastIndexOf("]");
  let end = Math.max(lastCurly, lastSquare);

  if (end !== -1) cleaned = cleaned.slice(0, end + 1);

  return cleaned.trim();
}

/**
 * Calls Gemini API to refine content.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string|null>}
 */
async function callGemini(systemPrompt, userPrompt) {
  try {
    const result = await model.generateContent([systemPrompt, userPrompt]);
    return result.response.text();
  } catch (error) {
    console.error("❌ Gemini API call failed:", error.message);
    if (error.response) {
      console.error("Detailed Error:", JSON.stringify(error.response, null, 2));
    }
    return null;
  }
}

/**
 * Refines JSON that has undergone a crude replacement.
 * @param {string} modifiedJsonString
 * @param {string} findQuery
 * @param {string} replaceQuery
 * @returns {Promise<string>}
 */
async function makeReplacementContextual(
  modifiedJsonString,
  findQuery,
  replaceQuery
) {
  const systemPrompt = `
ROLE: You are an AI assistant specializing in context-aware find-and-replace operations within JSON data. Your primary function is to refine a crude text replacement to ensure it is contextually and grammatically correct.

PRIMARY INSTRUCTION: The user attempted to find all instances of "${findQuery}" and replace them with "${replaceQuery}". Your job is to intelligently refine the result.

CRITICAL RULES:

1.  **Contextual & Named Entity Integrity:**
    * Understand the full context. If a version number or feature is tied to the original name (e.g., "2.5 Pro" for "Gemini"), it **MUST NOT** be incorrectly carried over to the new name.
    * Fix nonsensical phrases that result from the simple replacement.

2.  **Grammar and Flow:**
    * Correct any awkward phrasing, duplication, or grammatical errors (e.g., verb tenses, plurals, articles like "a/an"). The final text must read naturally.

3.  **Structural Integrity:**
    * You **MUST NOT** alter the JSON structure (keys, non-string values). Only modify string values.
    * Handle URLs carefully, ensuring they remain valid and contextually appropriate where possible.

4.  **Output Format:**
    * Your response **MUST BE** only the corrected JSON object. Do not include any explanatory text, comments, markdown, or code fences.

---
EXAMPLE of how to be "smart":

**Operation:** Replace "Gemini" with "Claude"

**Crude Input with an Error:**
\`\`\`json
{
  "title": "Claude 2.5 pro is a smart model"
}
\`\`\`

**Correct, Refined Output (removes "2.5 pro" because it does not belong to "Claude"):**
\`\`\`json
{
  "title": "Claude is a smart model"
}
\`\`\`
`;

  const userPrompt = `Refine the following JSON object:\n${modifiedJsonString}`;
  const geminiResponse = await callGemini(systemPrompt, userPrompt);

  if (geminiResponse) {
    let sanitized = sanitizeGeminiResponse(geminiResponse);

    try {
      // Try direct parse first
      JSON.parse(sanitized);
      console.log("✅ Gemini successfully refined the entry.");
      return sanitized;
    } catch (e1) {
      console.warn("⚠️ Gemini returned invalid JSON. Attempting repair...");

      try {
        const repaired = jsonrepair(sanitized);
        JSON.parse(repaired); // validate
        console.log("🔧 JSON repaired successfully.");
        return repaired;
      } catch (e2) {
        console.error(
          "❌ Still invalid JSON after repair. Falling back.",
          e2.message
        );
      }
    }
  }

  console.warn("⚠️ Falling back to the simple, unrefined replacement.");
  return modifiedJsonString;
}

/**
 * Batch refinement of multiple JSON strings.
 * @param {string[]} modifiedJsonStrings
 * @param {string} findQuery
 * @param {string} replaceQuery
 * @returns {Promise<string[]>}
 */
async function contextualRefinementBatch(
  modifiedJsonStrings,
  findQuery,
  replaceQuery
) {
  if (!modifiedJsonStrings || modifiedJsonStrings.length === 0) return [];

  console.log(
    `🤖 Starting contextual refinement for ${modifiedJsonStrings.length} entries...`
  );

  const processingPromises = modifiedJsonStrings.map((jsonString) =>
    makeReplacementContextual(jsonString, findQuery, replaceQuery)
  );

  return Promise.all(processingPromises);
}

module.exports = {
  makeReplacementContextual,
  contextualRefinementBatch,
};
