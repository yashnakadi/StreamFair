import { Router, Request, Response } from 'express';
import path from 'path';
import { adminAuth } from '../middleware/admin-auth';
import { listVideos, setOverridePrice, setManualAvgRatio, getVideo } from '../models/video';
import { listSessions } from '../models/session';

const router = Router();

// Serve admin dashboard (no auth needed for the HTML page itself)
router.get('/admin', (_req: Request, res: Response) => {
  res.sendFile(path.resolve(__dirname, '../views/admin.html'));
});

// GET /api/admin/videos — list all videos
router.get('/api/admin/videos', adminAuth, (_req: Request, res: Response) => {
  res.json(listVideos());
});

// PUT /api/admin/videos/:id/override — set or clear override price
router.put('/api/admin/videos/:id/override', adminAuth, (req: Request, res: Response) => {
  const videoId = req.params.id as string;
  const { overridePrice } = req.body;

  const existing = getVideo(videoId);
  if (!existing) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const price = overridePrice === null || overridePrice === undefined ? null : Number(overridePrice);
  const updated = setOverridePrice(videoId, price);
  res.json(updated);
});

// PUT /api/admin/videos/:id/ratio — set or clear manual avg watch ratio
router.put('/api/admin/videos/:id/ratio', adminAuth, (req: Request, res: Response) => {
  const videoId = req.params.id as string;
  const { manualAvgWatchRatio } = req.body;

  const existing = getVideo(videoId);
  if (!existing) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  let ratio: number | null = null;
  if (manualAvgWatchRatio !== null && manualAvgWatchRatio !== undefined) {
    ratio = Number(manualAvgWatchRatio);
    if (isNaN(ratio) || ratio < 0 || ratio > 100) {
      res.status(400).json({ error: 'manualAvgWatchRatio must be between 0 and 100' });
      return;
    }
  }

  const updated = setManualAvgRatio(videoId, ratio);
  res.json(updated);
});

// GET /api/admin/sessions — list recent sessions
router.get('/api/admin/sessions', adminAuth, (_req: Request, res: Response) => {
  res.json(listSessions());
});

export default router;
