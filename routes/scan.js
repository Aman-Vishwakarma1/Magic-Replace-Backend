const express = require("express");
const router = express.Router();
const scanController = require("../controllers/scanController");

// GET /scan?contentTypeUid=blog_post&query=Gemini
router.get("/", scanController.scan);

module.exports = router;
