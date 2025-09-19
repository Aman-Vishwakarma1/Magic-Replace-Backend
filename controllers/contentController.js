const contentstackService = require("../services/contentstackService");

/**
 * List all content types in the stack
 * @route GET /content-types
 */
async function listContentTypes(req, res) {
  try {
    const contentTypes = await contentstackService.getContentTypes();

    const result = contentTypes.map((ct) => ({
      uid: ct.uid,
      title: ct.title,
      description: ct.description,
      schema: ct.schema.length + " fields",
    }));

    res.json({ total: result.length, contentTypes: result });
  } catch (error) {
    console.error("❌ Error fetching content types:", error.message);
    res.status(500).json({ error: "Failed to fetch content types" });
  }
}

/**
 * List all entries for a given content type
 * @route GET /entries?contentTypeUid=blog_post
 */
async function listEntries(req, res) {
  const { contentTypeUid } = req.query;

  if (!contentTypeUid) {
    return res.status(400).json({ error: "contentTypeUid is required" });
  }

  try {
    const entries = await contentstackService.getEntries(contentTypeUid);

    const result = entries.map((entry) => ({
      uid: entry.uid,
      title: entry.title || "(no title)",
      updated_at: entry.updated_at,
      created_at: entry.created_at,
    }));

    res.json({ total: result.length, entries: result });
  } catch (error) {
    console.error("❌ Error fetching entries:", error.message);
    res.status(500).json({ error: "Failed to fetch entries" });
  }
}

module.exports = { listContentTypes, listEntries };
