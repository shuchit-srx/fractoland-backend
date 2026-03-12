require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// health route
app.get("/", (req, res) => {
  res.json({ message: "🚀 Server Message: Backend running" });
});

module.exports = app;