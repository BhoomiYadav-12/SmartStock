const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const productRoutes = require("./routes/productRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const authRoutes = require("./routes/authRoutes");
const forecastRoutes = require("./routes/forecastRoutes");
const decisionEngineRoutes = require("./routes/decisionEngineRoutes");
const simulatorRoutes = require("./routes/simulatorRoutes");
const teamRoutes = require("./routes/teamRoutes");
const anomalyRoutes = require("./routes/anomalyRoutes");
const assistantRoutes = require("./routes/assistantRoutes");
const deadStockRoutes = require("./routes/deadStockRoutes");

connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  dotfiles: "deny",
  fallthrough: false,
  index: false,
  maxAge: "1d"
}));
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/decision-engine", decisionEngineRoutes);
app.use("/api/simulator", simulatorRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/anomalies", anomalyRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/dead-stock", deadStockRoutes);

app.get("/", (req, res) => {
  res.send("StockSutra Server is running");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "StockSutra backend is working"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
