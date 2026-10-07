const mongoose = require("mongoose");

const productAssignmentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  changedByName: { type: String, required: true },
  previousAssignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

productAssignmentSchema.index({ organization: 1, product: 1, createdAt: -1 });

module.exports = mongoose.model("ProductAssignment", productAssignmentSchema);
