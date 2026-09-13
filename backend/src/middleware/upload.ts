import multer from 'multer';
import { BadRequestError } from '../shared/errors/AppError.js';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2MB - plenty for a member list CSV/XLSX

const XLSX_MIMETYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', // some browsers/OSes send this for .xlsx too
]);

const memberImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isCsv = file.mimetype === 'text/csv' || name.endsWith('.csv');
    const isXlsx = XLSX_MIMETYPES.has(file.mimetype) || name.endsWith('.xlsx');
    if (!isCsv && !isXlsx) {
      cb(new Error('Unsupported file type. Please upload a .csv or .xlsx file.'));
      return;
    }
    cb(null, true);
  },
});

/**
 * Multer wants its own error passed to Express's `next`, not thrown, so this
 * wraps the callback-style middleware into one route handlers can mount
 * directly - any file-type/size-limit failure surfaces as a normal 400.
 */
export function memberImportUpload(req: any, res: any, next: (err?: unknown) => void): void {
  memberImport.single('file')(req, res, (err: unknown) => {
    if (err) {
      next(new BadRequestError(err instanceof Error ? err.message : 'Upload failed'));
      return;
    }
    next();
  });
}
