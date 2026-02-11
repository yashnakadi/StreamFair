import { Request, Response, NextFunction } from 'express';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'streamfair-dev-token';

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
