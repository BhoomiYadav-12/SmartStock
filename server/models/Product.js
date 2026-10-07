const mongoose = require("mongoose");

const distributionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger }
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
    image: { type: String, default: "", trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Product.quantity remains available Main Inventory stock; member-held stock is tracked separately.
    distributions: { type: [distributionSchema], default: [] },
    name: {
      type: String,
      required: true,
      trim: true
    },

    category: {
      type: String,
      required: true,
      trim: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 0
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    lowStockThreshold: {
      type: Number,
      default: 10
    },

    // Unknown lead times remain null; recommendations never assume a supplier delay.
    supplierLeadTimeDays: {
      type: Number,
      default: null,
      min: 1,
      validate: {
        validator: (value) => value === null || Number.isInteger(value),
        message: "Supplier lead time must be a whole number of at least 1 day."
      }
    },

    supplier: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

productSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);
