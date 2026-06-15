import type { Request, Response, NextFunction } from 'express';
import {
  uploadsFallbackMiddleware,
  transparentPixel,
} from './uploads-fallback.middleware';

describe('uploadsFallbackMiddleware', () => {
  function createRes() {
    return {
      setHeader: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as Response;
  }

  it('returns 200 transparent PNG for GET requests', () => {
    const req = { method: 'GET' } as Request;
    const res = createRes();
    const next = jest.fn() as NextFunction;

    uploadsFallbackMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(transparentPixel);
  });

  it('returns 200 transparent PNG for HEAD requests', () => {
    const req = { method: 'HEAD' } as Request;
    const res = createRes();
    const next = jest.fn() as NextFunction;

    uploadsFallbackMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(transparentPixel);
  });

  it('calls next() for non-GET/HEAD methods', () => {
    const req = { method: 'POST' } as Request;
    const res = createRes();
    const next = jest.fn() as NextFunction;

    uploadsFallbackMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('exports a 70-byte transparent PNG buffer', () => {
    expect(transparentPixel).toBeInstanceOf(Buffer);
    expect(transparentPixel.length).toBe(70);
    expect(transparentPixel.toString('base64')).toBe(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );
  });
});
