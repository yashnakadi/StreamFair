import express from 'express';
import cors from 'cors';
import priceRoutes from './routes/price';
import sessionRoutes from './routes/sessions';
import adminRoutes from './routes/admin';
import xrplRoutes from './routes/xrpl';
import onboardingRoutes from './routes/onboarding';

export function createApp(): express.Application {
  const app = express();

  // CORS: allow chrome-extension origins + localhost
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin
        || origin.startsWith('chrome-extension://')
        || origin.startsWith('http://localhost')
        || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }));

  app.use(express.json());

  // Mount routes
  app.use('/api', priceRoutes);
  app.use('/api', sessionRoutes);
  app.use('/api', xrplRoutes);
  app.use('/api', onboardingRoutes);
  app.use('/', adminRoutes);

  return app;
}
