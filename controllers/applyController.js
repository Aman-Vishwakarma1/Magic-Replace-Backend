const contentstackService = require("../services/contentstackService");
const brandkitService = require("../services/brandkitService");

function setNestedValue(obj, path, value) {
  // Convert bracket notation to dot notation for consistent splitting
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current = obj;

  // Traverse the object to the second-to-last key
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null) {
      console.error(
        `Path traversal failed at key: '${key}' in path: '${path}'. The entry structure may have changed.`
      );
      return; // Stop if the path is invalid
    }
    current = current[key];
  }

  const finalKey = keys[keys.length - 1];

  // The 'value' from the frontend might be a stringified object/array from the diff.
  // We try to parse it; if it fails, we assume it's a regular string.
  try {
    current[finalKey] = JSON.parse(value);
  } catch (e) {
    current[finalKey] = value;
  }
}

/**
 * Handles the API request to apply changes to one or more entries.
 */
async function apply(req, res) {
  const { contentTypeUid, changes = [] } = req.body;

  if (!contentTypeUid || !Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({
      error: "contentTypeUid and a non-empty 'changes' array are required",
    });
  }

  try {
    const brandkit = await brandkitService.getRules();
    const results = [];

    // Group changes by entry UID to minimize API calls and process one entry at a time.
    const changesByEntry = changes.reduce((acc, change) => {
      // Validate the change object structure before adding it
      if (
        change &&
        change.entryUid &&
        change.field &&
        change.newValue !== undefined
      ) {
        if (!acc[change.entryUid]) {
          acc[change.entryUid] = [];
        }
        acc[change.entryUid].push(change);
      }
      return acc;
    }, {});

    // Process each entry that has selected changes using a modern loop.
    for (const [entryUid, entryChanges] of Object.entries(changesByEntry)) {
      let entryTitle = "(title unknown)";

      try {
        console.log(`Processing entry UID: ${entryUid}...`);
        // STEP 1: Fetch the latest version of the entry to avoid conflicts.
        const [entryData] = await contentstackService.getEntriesByIds(
          contentTypeUid,
          [entryUid]
        );
        if (!entryData) {
          throw new Error(
            `Entry with UID ${entryUid} not found or is inaccessible.`
          );
        }
        entryTitle = entryData.title || "(no title)";

        console.log(
          `Applying ${entryChanges.length} changes to "${entryTitle}"...`
        );

        // STEP 2: Apply all approved changes to the entry object in memory.
        for (const change of entryChanges) {
          const lowerCaseValue = String(change.newValue || "").toLowerCase();
          const isBanned = brandkit.bannedTerms.some((term) =>
            lowerCaseValue.includes(term.toLowerCase())
          );

          // Final server-side check for banned terms.
          if (isBanned) {
            console.warn(
              `⚠️ SKIPPING banned term for entry ${entryUid} at field ${change.field}.`
            );
            continue; // Skip this specific change if it contains a banned term.
          }
          setNestedValue(entryData, change.field, change.newValue);
        }

        // STEP 3: Perform a single update operation with all modifications applied.
        await contentstackService.updateEntry(
          contentTypeUid,
          entryUid,
          entryData
        );

        console.log(`✅ Successfully updated entry: ${entryUid}`);
        results.push({
          entryUid,
          title: entryTitle,
          status: "updated",
          changesApplied: entryChanges.length,
        });
      } catch (updateErr) {
        console.error(
          `❌ FAILED to update entry ${entryUid}:`,
          updateErr.message
        );
        results.push({
          entryUid,
          title: entryTitle,
          status: "failed",
          error: updateErr.message,
        });
      }
    }

    res.json({
      message: "Apply operation completed.",
      totalProcessed: Object.keys(changesByEntry).length,
      totalUpdated: results.filter((r) => r.status === "updated").length,
      totalFailed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error) {
    console.error(
      "❌ A critical error occurred during the apply process:",
      error.message,
      error.stack
    );
    res
      .status(500)
      .json({ error: "Failed to apply replacements due to a server error." });
  }
}

module.exports = { apply };
