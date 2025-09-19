require("dotenv").config();

const config = {
  PORT: process.env.PORT || 3000,
  CONTENTSTACK_API_KEY: process.env.CONTENTSTACK_API_KEY || "",
  CONTENTSTACK_MANAGEMENT_TOKEN:
    process.env.CONTENTSTACK_MANAGEMENT_TOKEN || "",
  BRANDKIT_API_KEY: process.env.BRANDKIT_API_KEY || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

module.exports = config;
