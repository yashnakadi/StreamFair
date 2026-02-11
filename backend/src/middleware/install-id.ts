import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      installId?: string;
    }
  }
}

export function extractInstallId(req: Request, res: Response, next: NextFunction): void {
  const installId = req.headers['x-install-id'] as string | undefined;
  if (!installId) {
    res.status(400).json({ error: 'Missing X-Install-Id header' });
    return;
  }
  req.installId = installId;
  next();
}
