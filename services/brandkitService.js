const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

const BRANDKIT_URL = process.env.BRANDKIT_API_URL;
const BRANDKIT_KEY = process.env.BRANDKIT_API_KEY;
const BRANDKIT_ID = process.env.BRANDKIT_ID;

/**
 * Reads the brandkit rules from the local brandkit.json file.
 * This is our fallback function.
 * @private
 * @returns {Promise<object>} The brandkit rules object.
 */
async function _getRulesFromFile() {
  try {
    const filePath = path.join(__dirname, "..", "brandkit.json");
    const data = await fs.readFile(filePath, "utf8");
    const rules = JSON.parse(data);
    return {
      approvedTerms: rules.approvedTerms || [],
      bannedTerms: rules.bannedTerms || [],
    };
  } catch (error) {
    console.error(
      "❌ Fallback failed: Could not read or parse local brandkit.json.",
      error
    );
    // Final safety net if both API and file fail
    return { approvedTerms: [], bannedTerms: [] };
  }
}

/**
 * Fetches the complete set of brand rules.
 * It first tries the Brandkit API and falls back to a local JSON file on failure.
 * @returns {Promise<{approvedTerms: Array, bannedTerms: Array}>}
 */
async function getRules() {
  // Only attempt API call if credentials are provided
  if (BRANDKIT_URL && BRANDKIT_KEY && BRANDKIT_ID) {
    try {
      console.log("ℹ️ Attempting to fetch rules from Brandkit API...");
      const response = await axios.get(`${BRANDKIT_URL}/rules/${BRANDKIT_ID}`, {
        headers: { Authorization: `Bearer ${BRANDKIT_KEY}` },
        timeout: 7000, // 7s timeout
      });
      console.log("✅ Successfully fetched rules from API.");
      return {
        approvedTerms: response.data.approvedTerms || [],
        bannedTerms: response.data.bannedTerms || [],
      };
    } catch (error) {
      // --- Fallback Logic ---
      console.warn(
        "⚠️ Brandkit API failed. Falling back to local brandkit.json file."
      );
      console.error("API Error Details:", error.message);
      return await _getRulesFromFile();
    }
  } else {
    // If no credentials, go straight to the fallback
    console.log(
      "ℹ️ Brandkit API credentials not found. Using local brandkit.json file."
    );
    return await _getRulesFromFile();
  }
}

/**
 * Validate a single replacement term using the Brandkit API.
 * NOTE: This function does not have a fallback and will fail if the API is down.
 */
async function validateReplacement(query, replaceWith) {
  if (!BRANDKIT_URL) {
    console.warn(
      "Cannot validate replacement: Brandkit API URL is not configured."
    );
    // If the API isn't configured, we can default to approving the change.
    return {
      approved: true,
      message: "Brandkit API not configured; validation skipped.",
    };
  }
  try {
    const payload = {
      brandkit_id: BRANDKIT_ID,
      original: query,
      replacement: replaceWith,
    };
    const response = await axios.post(`${BRANDKIT_URL}/validate`, payload, {
      headers: { Authorization: `Bearer ${BRANDKIT_KEY}` },
    });
    return response.data;
  } catch (error) {
    console.error(
      "❌ Brandkit API error (validate):",
      error.response?.data || error.message
    );
    return { approved: false, message: "Brandkit validation failed" };
  }
}

module.exports = {
  getRules,
  validateReplacement,
};
