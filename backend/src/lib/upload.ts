import multer from "multer";
import path from "path";

// Buffered in memory rather than written straight to local disk - saveUploadedFile
// (lib/storage.ts) decides afterwards whether that buffer goes to S3-compatible
// object storage or to the local uploads/ folder, so this middleware doesn't need
// to know which backend is active.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("نوع الملف غير مدعوم، يُسمح فقط بـ PDF أو صور"));
    }
  },
});
