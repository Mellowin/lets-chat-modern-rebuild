import type { Request, Response, NextFunction } from 'express';

/**
 * 1x1 transparent PNG pixel (base64).
 * Used as a safe fallback for missing avatar/upload images so browsers see a
 * valid image response instead of a JSON 404 that triggers CORB warnings.
 */
export const transparentPixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Express middleware that returns a transparent PNG for any GET/HEAD request.
 *
 * This is mounted *after* the static file server on `/uploads`, so it only runs
 * when a requested upload file is missing. Returning HTTP 200 with
 * `Content-Type: image/png` avoids Chrome CORB warnings that appear when an
 * `<img>` tag loads a route that responds with JSON.
 */
export function uploadsFallbackMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  res.setHeader('Content-Type', 'image/png');
  res.status(200).send(transparentPixel);
}
