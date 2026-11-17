import type { Request, RequestHandler, Response } from 'express';

// Express 4 doesn't catch rejected promises, so a failed handler would crash the server.
export const route =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res).catch(next);
  };
