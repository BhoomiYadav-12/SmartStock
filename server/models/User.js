const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    role: {
      type: String,
      enum: ["admin", "manager", "staff", "user"],
      default: "admin"
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" }
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

module.exports = mongoose.model("User", userSchema);
