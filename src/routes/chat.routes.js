import express from "express";
import authMiddleware from "../middlewares/auth.js";
import {
  getChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  addMember,
  removeMember,
  toggleBlockMember,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  uploadChatFile,
  searchUsers,
  getUnreadCounts,
  joinClientChannel,
  toggleReaction,
  generateInviteCode,
  getInviteInfo,
  joinByInvite,
} from "../controllers/chat.controller.js";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../cloudinaryConfig.js";

const router = express.Router();

// Cloudinary storage for chat uploads
const chatStorage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: "appointdi-chat",
    resource_type: "auto", // supports images, videos, raw files
    public_id: (req, file) => `chat-${Date.now()}-${file.originalname.split('.')[0]}`,
  },
});
const chatUpload = multer({ storage: chatStorage });

// Channel CRUD
router.get("/channels", authMiddleware, getChannels);
router.post("/channels", authMiddleware, createChannel);
router.get("/channels/:id", authMiddleware, getChannel);
router.put("/channels/:id", authMiddleware, updateChannel);
router.delete("/channels/:id", authMiddleware, deleteChannel);

// Channel members
router.post("/channels/:id/members", authMiddleware, addMember);
router.delete("/channels/:id/members/:userId", authMiddleware, removeMember);
router.put("/channels/:id/members/:userId/block", authMiddleware, toggleBlockMember);

// Messages
router.get("/channels/:id/messages", authMiddleware, getMessages);
router.post("/channels/:id/messages", authMiddleware, sendMessage);
router.put("/messages/:msgId", authMiddleware, editMessage);
router.delete("/messages/:msgId", authMiddleware, deleteMessage);

// Read receipts
router.post("/channels/:id/read", authMiddleware, markAsRead);

// File upload
router.post("/upload", authMiddleware, chatUpload.single("file"), uploadChatFile);

// User search
router.get("/users/search", authMiddleware, searchUsers);

// Unread counts
router.get("/unread", authMiddleware, getUnreadCounts);

// Client channel join
router.post("/client-channel/:locationId/join", authMiddleware, joinClientChannel);

// Reactions
router.post("/messages/:messageId/react", authMiddleware, toggleReaction);

// Invites
router.post("/channels/:id/invite", authMiddleware, generateInviteCode);
router.get("/invite/:code", getInviteInfo); // Public or auth? Let's make it public to fetch name/avatar
router.post("/invite/:code/join", authMiddleware, joinByInvite);

export default router;
