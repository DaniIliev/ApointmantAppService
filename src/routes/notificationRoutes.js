import express from 'express';
import { subscribe, getVapidPublicKey, sendNotification } from '../controllers/notificationController.js';
import passport from 'passport';

const router = express.Router();

// Middleware for authentication
const authenticate = passport.authenticate('jwt', { session: false });

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', authenticate, subscribe);
router.post('/send', authenticate, sendNotification); // In a real app, this should be admin-only

export default router;
