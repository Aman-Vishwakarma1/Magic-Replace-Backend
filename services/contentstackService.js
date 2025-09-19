const contentstack = require("@contentstack/management");
const config = require("../config");

const client = contentstack.client({});

async function getStack() {
  return client.stack({
    api_key: config.CONTENTSTACK_API_KEY,
    management_token: config.CONTENTSTACK_MANAGEMENT_TOKEN,
  });
}

async function getContentTypes() {
  try {
    const stack = await getStack();
    const response = await stack.contentType().query().find();
    return response.items || [];
  } catch (err) {
    console.error("❌ Contentstack getContentTypes error:", err);
    throw err;
  }
}

async function getEntries(contentTypeUid) {
  try {
    const stack = await getStack();
    const response = await stack
      .contentType(contentTypeUid)
      .entry()
      .query()
      .find();
    return response.items || [];
  } catch (err) {
    console.error("❌ Contentstack getEntries error:", err);
    throw err;
  }
}

async function getEntriesByIds(contentTypeUid, entryUids) {
  try {
    // --- DEBUG MESSAGE ADDED HERE ---
    console.log(
      "✅ --- RUNNING THE CORRECTED getEntriesByIds function! --- ✅"
    );

    if (!entryUids || entryUids.length === 0) {
      return [];
    }
    const stack = await getStack();
    const query = { uid: { $in: entryUids } };

    // This is the corrected line
    const response = await stack
      .contentType(contentTypeUid)
      .entry()
      .query(query)
      .find();

    return response.items || [];
  } catch (err) {
    console.error("❌ Contentstack getEntriesByIds error:", err);
    throw err;
  }
}

async function updateEntry(contentTypeUid, entryUid, updatedData) {
  try {
    const stack = await getStack();
    const entryInstance = await stack
      .contentType(contentTypeUid)
      .entry(entryUid)
      .fetch();

    for (const key in updatedData) {
      if (
        Object.prototype.hasOwnProperty.call(updatedData, key) &&
        key !== "uid"
      ) {
        entryInstance[key] = updatedData[key];
      }
    }
    return await entryInstance.update();
  } catch (err) {
    console.error(`❌ Failed to update entry ${entryUid}:`, err);
    const errorMessage = err.errors ? JSON.stringify(err.errors) : err.message;
    throw new Error(errorMessage);
  }
}

module.exports = {
  getContentTypes,
  getEntries,
  getEntriesByIds,
  updateEntry,
};
