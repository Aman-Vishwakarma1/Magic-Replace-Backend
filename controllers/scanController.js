const contentstackService = require("../services/contentstackService");
function scanRecursive(obj, query, parentField, results, entryUid) {
  if (obj == null) return;

  if (typeof obj === "string") {
    if (obj.toLowerCase().includes(query.toLowerCase())) {
      results.push({
        entryUid,
        field: parentField,
        before: obj,
      });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      scanRecursive(item, query, `${parentField}[${index}]`, results, entryUid);
    });
  } else if (typeof obj === "object") {
    Object.keys(obj).forEach((key) => {
      scanRecursive(
        obj[key],
        query,
        parentField ? `${parentField}.${key}` : key,
        results,
        entryUid
      );
    });
  }
}

/**
 * Scan entries for a search string, filtering by selected UIDs.
 * @route GET /scan?contentTypeUid=article&query=Gemini&entryUids=uid1&entryUids=uid2
 */
async function scan(req, res) {
  const { contentTypeUid, query, entryUids } = req.query;

  if (!contentTypeUid || !query || !entryUids) {
    return res
      .status(400)
      .json({ error: "contentTypeUid, query, and entryUids are required" });
  }

  const selectedEntryUids = Array.isArray(entryUids) ? entryUids : [entryUids];

  try {
    const entries = await contentstackService.getEntries(
      contentTypeUid,
      selectedEntryUids
    );

    const matches = [];

    entries.forEach((entry) => {
      scanRecursive(entry, query, "", matches, entry.uid);
    });

    const enrichedMatches = matches.map((match) => {
      const entry = entries.find((e) => e.uid === match.entryUid);
      return {
        ...match,
        title: entry.title || "(no title)",
        updated_at: entry.updated_at,
      };
    });

    res.json({
      query,
      totalMatches: enrichedMatches.length,
      matches: enrichedMatches,
    });
  } catch (error) {
    console.error("Scan error:", error.message);
    res.status(500).json({ error: "Failed to scan entries" });
  }
}

module.exports = { scan };
