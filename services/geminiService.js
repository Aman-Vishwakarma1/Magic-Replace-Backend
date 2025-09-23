/**
 * @fileoverview A service for refining text using the Google Generative AI SDK.
 * This service takes content that has already undergone a basic find-and-replace
 * and uses a generative model to improve its contextual accuracy and flow.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { jsonrepair } = require("jsonrepair");

// --- CONFIGURATION ---
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash";

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
You are an expert content editor specializing in programmatic text refinement.
The original operation was: replace all instances of "${findQuery}" with "${replaceQuery}".

Your task:
- Correct any awkward phrasing or duplication caused by this replacement.
- Ensure grammar, verb tenses, and plurals are correct.
- Fix nonsensical phrases (e.g., "Mount China Mount Everest").
- Handle names, titles, and URLs carefully so they remain valid.
- DO NOT change the JSON structure (keys, non-string values).
- Final output MUST be valid JSON only, without explanations, comments, or code fences.

IMPORTANT: Respond with ONLY the corrected JSON.
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
