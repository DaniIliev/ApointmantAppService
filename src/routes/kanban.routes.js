import express from "express";
import authMiddleware from "../middlewares/auth.js";
import {
  // Board controllers
  getBoards,
  getBoardById,
  createBoard,
  updateBoard,
  deleteBoard,
  // Column controllers
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  // Card controllers
  createCard,
  updateCard,
  deleteCard,
  reorderCards,
  // Comment controllers
  addComment,
  deleteComment,
  // Attachment controllers
  addAttachment,
  deleteAttachment,
  // Business members
  getBusinessMembers,
} from "../controllers/kanban.controller.js";

const router = express.Router();

// All routes require authentication (Bearer token)
router.use(authMiddleware);

// ===== BOARD ROUTES =====
router.get("/boards", getBoards); // GET /api/kanban/boards?businessId=xxx
router.get("/boards/:id", getBoardById); // GET /api/kanban/boards/:id
router.post("/boards", createBoard); // POST /api/kanban/boards
router.put("/boards/:id", updateBoard); // PUT /api/kanban/boards/:id
router.delete("/boards/:id", deleteBoard); // DELETE /api/kanban/boards/:id

// ===== COLUMN ROUTES =====
// Place specific action routes BEFORE param routes to avoid ':id' capturing 'reorder'
router.put("/columns/reorder", reorderColumns); // PUT /api/kanban/columns/reorder
router.post("/columns", createColumn); // POST /api/kanban/columns
router.put("/columns/:id", updateColumn); // PUT /api/kanban/columns/:id
router.delete("/columns/:id", deleteColumn); // DELETE /api/kanban/columns/:id

// ===== CARD ROUTES =====
router.put("/cards/reorder", reorderCards); // PUT /api/kanban/cards/reorder (placed before :id)
router.post("/cards", createCard); // POST /api/kanban/cards
router.put("/cards/:id", updateCard); // PUT /api/kanban/cards/:id
router.delete("/cards/:id", deleteCard); // DELETE /api/kanban/cards/:id

// ===== COMMENT ROUTES =====
router.post("/cards/:cardId/comments", addComment); // POST /api/kanban/cards/:cardId/comments
router.delete("/cards/:cardId/comments/:commentId", deleteComment); // DELETE /api/kanban/cards/:cardId/comments/:commentId

// ===== ATTACHMENT ROUTES =====
router.post("/cards/:cardId/attachments", addAttachment); // POST /api/kanban/cards/:cardId/attachments
router.delete("/cards/:cardId/attachments/:attachmentId", deleteAttachment); // DELETE /api/kanban/cards/:cardId/attachments/:attachmentId

// ===== BUSINESS MEMBERS =====
router.get("/business/:businessId/members", getBusinessMembers); // GET /api/kanban/business/:businessId/members

export default router;
