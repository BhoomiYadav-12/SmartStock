const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const Organization = require("../models/Organization");
const { ensureOrganization } = authMiddleware;

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createToken = (user) => jwt.sign(
  { userId: user._id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  organization: user.organization,
  status: user.status
});

router.post("/register", async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: "Authentication is not configured" });
    }
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required" });
    }
    if (!emailPattern.test(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }

    const user = await User.create({ name, email, password, role: "admin", status: "active" });
    const organization = await Organization.create({ name: `${name}'s Workspace`, createdBy: user._id });
    user.organization = organization._id;
    await user.save();
    return res.status(201).json({
      success: true,
      token: createToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }
    console.error("Registration failed:", error);
    return res.status(500).json({ success: false, message: "Unable to register. Please try again" });
  }
});

router.post("/login", async (req, res) => {
  let stage = "configuration";
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: "Authentication is not configured" });
    }
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    stage = "user lookup";
    const user = await User.findOne({ email });
    console.log(user);
    
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    stage = "password verification";
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (user.status === "inactive") {
      return res.status(403).json({ success: false, message: "This account is inactive. Contact your workspace admin." });
    }
    stage = "workspace association";
    await ensureOrganization(user);

    stage = "token generation";
    return res.json({ success: true, token: createToken(user), user: publicUser(user) });
  } catch (error) {
    // Log only diagnostic metadata. Never include request data, credentials, or tokens.
    const mongooseBufferTimeout = typeof error?.message === "string"
      ? error.message.match(/^Operation `?([\w.$()]+)`? buffering timed out after (\d+)ms$/)
      : null;
    // console.error("Login failed", {
    //   stage,
    //   errorName: error?.name || "Error",
    //   errorCode: typeof error?.code === "string" || typeof error?.code === "number" ? error.code : undefined,
    //   ...(mongooseBufferTimeout && {
    //     diagnostic: `Mongoose ${mongooseBufferTimeout[1]} buffer timed out after ${mongooseBufferTimeout[2]}ms`
    //   })
    // });
    console.log(error);
    
    return res.status(500).json({ success: false, message: "Unable to log in. Please try again" });
  }
});

router.get("/me", authMiddleware, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

module.exports = router;
