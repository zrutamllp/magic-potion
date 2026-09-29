import express, { type NextFunction, type Request, type Response } from 'express';
import { MAX_UPLOAD_BYTES } from '../uploads/image';

// A picture upload is the raw request body (Content-Type image/...), not a form.
const rawImage = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });

export function readImage(req: Request, res: Response, next: NextFunction): void {
  rawImage(req, res, (error?: unknown) => {
    if (!error) return next();
    res.status(413).json({
      code: 'FILE_TOO_BIG',
      message: `That picture is too big. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    });
  });
}
