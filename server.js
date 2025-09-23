const express = require("express");
const app = express();
const config = require("./config");
const cors = require("cors");

// Middleware
app.use(express.json());

app.use(cors());

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Import routes

const contentRoutes = require("./routes/content");
const scanRoutes = require("./routes/scan");
const previewRoutes = require("./routes/preview");
const applyRoutes = require("./routes/apply");

// Mount routes
app.use("/", contentRoutes);
app.use("/scan", scanRoutes);
app.use("/preview", previewRoutes);
app.use("/apply", applyRoutes);

// Start server
const PORT = config.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
