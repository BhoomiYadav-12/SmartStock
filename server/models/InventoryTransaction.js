const mongoose = require("mongoose");

const inventoryTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    performedByName: { type: String, default: "", trim: true },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ["IN", "OUT", "TRANSFER", "RETURN"],
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    previousQuantity: {
      type: Number,
      required: true,
      min: 0
    },
    newQuantity: {
      type: Number,
      required: true,
      min: 0
    },
    note: {
      type: String,
      default: ""
    },
    sourceLocation: { type: String, default: "" },
    destinationLocation: { type: String, default: "" },
    sourceUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    destinationUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    sourcePreviousQuantity: { type: Number, default: null },
    sourceNewQuantity: { type: Number, default: null },
    destinationPreviousQuantity: { type: Number, default: null },
    destinationNewQuantity: { type: Number, default: null }
  },
  { timestamps: true }
);

inventoryTransactionSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("InventoryTransaction", inventoryTransactionSchema);
