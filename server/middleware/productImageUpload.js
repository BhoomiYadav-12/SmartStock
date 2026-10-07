const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadRoot = path.resolve(__dirname, "..", "uploads");
const allowedTypes = new Map([
  ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const directory = path.join(uploadRoot, String(req.user.organization));
    fs.mkdir(directory, { recursive: true }, (error) => callback(error, directory));
  },
  filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${allowedTypes.get(file.mimetype) || ".img"}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    if (!allowedTypes.has(file.mimetype) || !allowedExtensions.includes(extension)) {
      return callback(new Error("Use a JPG, JPEG, PNG, or WEBP image."));
    }
    return callback(null, true);
  }
}).single("image");

const isValidImageData = (buffer, mimeType) => {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
};

const handleImageUpload = (req, res, next) => upload(req, res, async (error) => {
  if (!error && req.file) {
    try {
      const data = await fs.promises.readFile(req.file.path);
      if (!isValidImageData(data, req.file.mimetype)) {
        await fs.promises.unlink(req.file.path);
        return res.status(400).json({ success: false, message: "The uploaded file is not a valid JPG, PNG, or WEBP image." });
      }
    } catch {
      try { await fs.promises.unlink(req.file.path); } catch { /* File may already be gone. */ }
      return res.status(400).json({ success: false, message: "Unable to validate the uploaded image." });
    }
  }
  if (!error) return next();
  const message = error.code === "LIMIT_FILE_SIZE"
    ? "Product images must be 5 MB or smaller."
    : error.message || "Unable to upload product image.";
  return res.status(400).json({ success: false, message });
});

const removeStoredImage = async (imagePath) => {
  if (!imagePath || !imagePath.startsWith("/uploads/")) return;
  const absolutePath = path.resolve(uploadRoot, imagePath.slice("/uploads/".length));
  if (!absolutePath.startsWith(`${uploadRoot}${path.sep}`)) return;
  try { await fs.promises.unlink(absolutePath); } catch (error) {
    if (error.code !== "ENOENT") console.error("Unable to remove product image:", error.message);
  }
};

module.exports = { handleImageUpload, removeStoredImage };
