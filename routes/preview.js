// routes/preview.js
const express = require("express");
const router = express.Router();
const previewController = require("../controllers/previewController");

router.get("/", previewController.preview);

module.exports = router;
