const express = require("express");
const router = express.Router();
const contentController = require("../controllers/contentController");

// GET /content-types
router.get("/content-types", contentController.listContentTypes);

// GET /entries?contentTypeUid=blog_post
router.get("/entries", contentController.listEntries);

module.exports = router;
