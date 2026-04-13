import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import dotenv from 'dotenv';
dotenv.config();

// Helper to initialize web-push only after environment is loaded
const initWebPush = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_EMAIL || 'mailto:admin@appointdi.com';

  if (!publicKey || !privateKey) {
    console.error('VAPID keys not found in environment');
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
};

export const subscribe = async (req, res) => {
  initWebPush();
  try {
    const { subscription, deviceType } = req.body;
    const userId = req.user.id;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'Invalid subscription object' });
    }

    // Save to DB (Update if endpoint already exists)
    await PushSubscription.findOneAndUpdate(
      { 'subscription.endpoint': subscription.endpoint },
      { userId, subscription, deviceType },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error in notification subscription:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getVapidPublicKey = (req, res) => {
  initWebPush();
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};

export const sendNotification = async (req, res) => {
  initWebPush();
  try {
    const { userId, title, body, url } = req.body;

    const subscriptions = await PushSubscription.find({ userId });

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(404).json({ message: 'No subscriptions found for this user' });
    }

    const payload = JSON.stringify({ title, body, url });

    const notificationPromises = subscriptions.map(sub => {
      return webpush.sendNotification(sub.subscription, payload)
        .catch(error => {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription has expired or is no longer valid
            return PushSubscription.deleteOne({ _id: sub._id });
          }
          console.error('Error sending notification:', error);
        });
    });

    await Promise.all(notificationPromises);
    res.json({ message: 'Notifications sent' });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
