const contentstackService = require("../services/contentstackService");
const brandkitService = require("../services/brandkitService");
const geminiService = require("../services/geminiService"); // Re-added gemini service

/**
 * Deep clone an object, but strip out functions and handle cyclical references.
 */
function sanitizeObject(data, visited = new WeakMap()) {
  if (data === null || typeof data !== "object") {
    return data;
  }
  if (visited.has(data)) {
    return visited.get(data);
  }

  if (Array.isArray(data)) {
    const arr = [];
    visited.set(data, arr);
    data.forEach((item) => arr.push(sanitizeObject(item, visited)));
    return arr;
  }

  const obj = {};
  visited.set(data, obj);
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (typeof data[key] !== "function") {
        obj[key] = sanitizeObject(data[key], visited);
      }
    }
  }
  return obj;
}

/**
 * Traverse a JSON object and apply an array of replacer functions to all string values.
 */
function traverseAndModify(data, replacers, seen = new WeakSet()) {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data === "string") {
    return replacers.reduce((text, func) => func(text), data);
  }
  if (typeof data === "object") {
    if (seen.has(data)) {
      return "[Circular Reference]";
    }
    seen.add(data);

    if (Array.isArray(data)) {
      return data.map((item) => traverseAndModify(item, replacers, seen));
    }

    const obj = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        obj[key] = traverseAndModify(data[key], replacers, seen);
      }
    }
    return obj;
  }
  return data;
}

/**
 * Format different value types for a user-friendly display in a diff.
 */
function formatValueForDiff(value) {
  if (value === undefined) return "(not set)";
  if (value === null) return "(empty)";
  if (typeof value === "string" && value.trim() === "") return "(empty string)";
  if (typeof value === "object") {
    if (Array.isArray(value) && value.length === 0) return "[]";
    if (Object.keys(value).length === 0) return "{}";
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Recursively compare an original and updated object to find differences.
 */
function getDifferences(original, updated, parentField = "") {
  const diffs = [];
  if (original === updated) return [];

  const before = formatValueForDiff(original);
  const after = formatValueForDiff(updated);
  if (before === after) return [];

  if (Array.isArray(original) && Array.isArray(updated)) {
    const len = Math.max(original.length, updated.length);
    for (let i = 0; i < len; i++) {
      diffs.push(
        ...getDifferences(original[i], updated[i], `${parentField}[${i}]`)
      );
    }
    return diffs;
  }

  if (
    typeof original === "object" &&
    original !== null &&
    typeof updated === "object" &&
    updated !== null
  ) {
    const allKeys = new Set([
      ...Object.keys(original),
      ...Object.keys(updated),
    ]);
    allKeys.forEach((key) => {
      diffs.push(
        ...getDifferences(
          original[key],
          updated[key],
          parentField ? `${parentField}.${key}` : key
        )
      );
    });
    return diffs;
  }

  diffs.push({ field: parentField, before, after });
  return diffs;
}

/**
 * Escape special characters in a string for use in a regular expression.
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate a preview of find-and-replace changes on specified entries.
 */
async function preview(req, res) {
  // Restore 'smart' flag from query
  const { contentTypeUid, query, replaceWith, smart } = req.query;
  const useSmartReplace = smart === "true";
  let { entryUids } = req.query;

  if (entryUids && !Array.isArray(entryUids)) {
    entryUids = [entryUids];
  }

  if (!contentTypeUid || !query || !replaceWith || !entryUids) {
    return res.status(400).json({
      error: "contentTypeUid, query, replaceWith, and entryUids are required",
    });
  }

  try {
    const brandkit = await brandkitService.getRules();
    const entries = await contentstackService.getEntriesByIds(
      contentTypeUid,
      entryUids
    );
    const previewResults = [];
    const originalEntries = entries.map((e) => sanitizeObject(e));

    // Define replacer functions once
    const brandkitReplacer = (text) => {
      let newText = text;
      brandkit.approvedTerms.forEach((rule) => {
        const escapedTerm = escapeRegExp(rule.term);
        const regex = new RegExp(`\\b${escapedTerm}\\b`, "gi");
        newText = newText.replace(regex, rule.replaceWith);
      });
      return newText;
    };
    const userQueryReplacer = (text) => {
      const regex = new RegExp(escapeRegExp(query), "gi");
      return text.replace(regex, replaceWith);
    };
    const replacers = [brandkitReplacer, userQueryReplacer];

    // --- LOGIC FOR SMART CONTEXTUAL ENHANCEMENT ---
    if (useSmartReplace) {
      console.log(
        `🤖 Smart Contextual Enhancement for ${originalEntries.length} entries`
      );

      for (const originalEntry of originalEntries) {
        // Step 1: Perform the traditional replacement first to get a baseline
        const traditionallyUpdatedEntry = traverseAndModify(
          structuredClone(originalEntry),
          replacers
        );

        // Step 2: Send the baseline result to Gemini for contextual improvement
        let updatedEntry;
        try {
          const textForGemini = JSON.stringify(
            traditionallyUpdatedEntry,
            null,
            2
          );

          // This function in geminiService would contain the prompt, e.g.,
          // "Review the following JSON. It resulted from replacing '${query}' with '${replaceWith}'.
          // Please correct any phrasing that sounds unnatural or contextually wrong due to the
          // simple replacement. Return only the corrected JSON object."
          const contextualText = await geminiService.makeReplacementContextual(
            textForGemini,
            query,
            replaceWith
          );
          updatedEntry = JSON.parse(contextualText);
        } catch (e) {
          console.warn(
            `⚠️ Gemini enhancement failed for entry ${originalEntry.uid}. Falling back to traditional replace. Error: ${e.message}`
          );
          // Fallback to the traditional result if Gemini fails or returns invalid JSON
          updatedEntry = traditionallyUpdatedEntry;
        }

        const differences = getDifferences(originalEntry, updatedEntry);
        if (differences.length > 0) {
          const changes = differences.map((d) => {
            const afterValue = String(d.after || "").toLowerCase();
            const isBanned = brandkit.bannedTerms.some((term) =>
              afterValue.includes(term.toLowerCase())
            );
            return { ...d, brandkit_approved: !isBanned };
          });

          previewResults.push({
            entryUid: originalEntry.uid,
            title: originalEntry.title || "(no title)",
            changes,
          });
        }
      }
    }
    // --- LOGIC FOR TRADITIONAL REPLACEMENT ONLY ---
    else {
      console.log(
        `⚙️ Traditional Replace for ${originalEntries.length} entries`
      );

      originalEntries.forEach((originalEntry) => {
        const updatedEntry = traverseAndModify(
          structuredClone(originalEntry),
          replacers
        );

        const differences = getDifferences(originalEntry, updatedEntry);
        if (differences.length > 0) {
          const changes = differences.map((d) => {
            const afterValue = String(d.after || "").toLowerCase();
            const isBanned = brandkit.bannedTerms.some((term) =>
              afterValue.includes(term.toLowerCase())
            );
            return { ...d, brandkit_approved: !isBanned };
          });

          previewResults.push({
            entryUid: originalEntry.uid,
            title: originalEntry.title || "(no title)",
            changes,
          });
        }
      });
    }

    res.json({
      query,
      replaceWith,
      mode: useSmartReplace ? "smart" : "traditional", // Mode reflects the path taken
      totalChanges: previewResults.reduce(
        (sum, entry) => sum + entry.changes.length,
        0
      ),
      preview: previewResults,
    });
  } catch (err) {
    console.error("❌ Preview error:", err.message, err.stack);
    res.status(500).json({ error: "Failed to generate preview" });
  }
}

module.exports = { preview };
