/**
 * @fileoverview A service for refining text using the Google Generative AI SDK.
 * This service takes content that has already undergone a basic find-and-replace
 * and uses a generative model to improve its contextual accuracy and flow.
 */

// Uses the official Google AI SDK for Node.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- CONFIGURATION ---
// It's best practice to set your API key in an environment variable
const API_KEY = "AIzaSyCdNBRIiED6RycQjknQ_3Qjg61FdhZaYRo";
const GEMINI_MODEL = "gemini-1.5-flash"; // Using a modern, recommended model

// --- INITIALIZATION ---
if (!API_KEY) {
  console.error("❌ FATAL: GEMINI_API_KEY environment variable is not set.");
  // Exit or throw an error to prevent the app from running without configuration
  throw new Error("GEMINI_API_KEY is not set.");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  // Ensure the model outputs JSON, simplifying parsing
  responseMimeType: "application/json",
});

console.log(`🌍 Using Gemini Model: ${GEMINI_MODEL}`);

/**
 * Makes a request to the Gemini API to get a contextual refinement.
 *
 * @param {string} systemPrompt - The detailed instruction for the AI model.
 * @param {string} userPrompt - The user's content to be processed.
 * @returns {Promise<string|null>} The refined text content from the API, or null on failure.
 */
async function callGemini(systemPrompt, userPrompt) {
  try {
    const result = await model.generateContent([systemPrompt, userPrompt]);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error("❌ Gemini API call failed:", error.message);
    // Log the detailed error if available, which can include safety feedback
    if (error.response) {
      console.error("Detailed Error:", JSON.stringify(error.response, null, 2));
    }
    return null;
  }
}

/**
 * Takes a JSON string that has already had a simple find-and-replace operation
 * and uses Gemini to refine it for better contextual and grammatical accuracy.
 *
 * @param {string} modifiedJsonString - The stringified JSON object after a basic replacement.
 * @param {string} findQuery - The original term that was replaced.
 * @param {string} replaceQuery - The new term it was replaced with.
 * @returns {Promise<string>} The contextually refined, stringified JSON object.
 */
async function makeReplacementContextual(
  modifiedJsonString,
  findQuery,
  replaceQuery
) {
  const systemPrompt = `
    You are an expert content editor. Your task is to refine a JSON object that has just undergone a crude, programmatic find-and-replace.
    The operation was: replace all instances of "${findQuery}" with "${replaceQuery}".

    Your Rules:
    1.  Review all string values in the provided JSON object.
    2.  Correct any grammatical errors, awkward phrasing, or contextual mistakes introduced by the simple replacement. For example, fix plurals, verb tenses, and sentence flow.
    3.  Do NOT alter the JSON structure (keys and non-string values).
    4.  Your final output MUST be only the corrected, valid JSON object, with no extra text, explanations, or code fences (like \`\`\`json).
  `;

  const userPrompt = `Refine the following JSON object:\n${modifiedJsonString}`;

  const geminiResponse = await callGemini(systemPrompt, userPrompt);

  if (geminiResponse) {
    try {
      // Validate that the response is parseable JSON.
      JSON.parse(geminiResponse);
      // The model is configured to return JSON, so we trust it if it's valid.
      console.log("✅ Gemini successfully refined the entry.");
      return geminiResponse;
    } catch (e) {
      console.error(
        "❌ Gemini returned invalid JSON. Falling back to the original modified string.",
        e.message
      );
    }
  }

  // Fallback if the API call fails or returns invalid data
  console.warn("⚠️ Falling back to the simple, unrefined replacement.");
  return modifiedJsonString;
}

/**
 * Processes a batch of modified JSON strings, applying contextual refinement to each.
 *
 * @param {string[]} modifiedJsonStrings - An array of stringified JSON objects.
 * @param {string} findQuery - The original term that was replaced.
 * @param {string} replaceQuery - The new term it was replaced with.
 * @returns {Promise<string[]>} A promise that resolves to an array of refined JSON strings.
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
  // This is the primary function the controller will use
  makeReplacementContextual,
  contextualRefinementBatch,
};
