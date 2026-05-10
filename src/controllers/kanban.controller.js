import {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
} from "../models/KanbanBoard.js";
import Alert from "../models/Alert.js";
import { io } from "../index.js";
import User from "../models/User.js";
import Business from "../models/Business.js";
import mongoose from "mongoose";

// ===== BOARD CONTROLLERS =====

export const getBoards = async (req, res) => {
  try {
    const { businessId } = req.query;

    if (!businessId) {
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Business ID is required." 
      });
    }

    const boards = await KanbanBoard.find({ business: businessId })
      .populate("createdBy", "firstName lastName email avatar")
      .populate("members", "firstName lastName email avatar")
      .sort({ createdAt: -1 });

    res.status(200).json(boards);
  } catch (error) {
    console.error("Error fetching boards:", error);
    res.status(500).json({ 
      errorCode: "FETCH_BOARDS_FAILED",
      message: "Failed to fetch boards." 
    });
  }
};

export const getBoardById = async (req, res) => {
  try {
    const { id } = req.params;

    const board = await KanbanBoard.findById(id)
      .populate("createdBy", "firstName lastName email avatar")
      .populate("members", "firstName lastName email avatar");

    if (!board) {
      return res.status(404).json({ 
        errorCode: "BOARD_NOT_FOUND",
        message: "Board not found." 
      });
    }

    // Get all columns for this board
    const columns = await KanbanColumn.find({ boardId: id }).sort({ order: 1 });

    // Get all cards for these columns
    const columnIds = columns.map((col) => col._id);
    const cards = await KanbanCard.find({ columnId: { $in: columnIds } })
      .populate("assignedUsers", "firstName lastName email avatar")
      .populate("createdBy", "firstName lastName email avatar")
      .populate("comments.userId", "firstName lastName email avatar")
      .populate("attachments.uploadedBy", "firstName lastName email avatar")
      .sort({ order: 1 });

    // Organize cards by column
    const columnsWithCards = columns.map((col) => ({
      ...col.toObject(),
      cards: cards.filter(
        (card) => card.columnId.toString() === col._id.toString()
      ),
    }));

    res.status(200).json({
      ...board.toObject(),
      columns: columnsWithCards,
    });
  } catch (error) {
    console.error("Error fetching board:", error);
    res.status(500).json({ 
      errorCode: "FETCH_BOARD_FAILED",
      message: "Failed to fetch board." 
    });
  }
};

export const createBoard = async (req, res) => {
  try {
    const { title, description, businessId } = req.body;
    const userId = req.user.id;

    if (!title || !businessId) {
      return res.status(400)
        .json({ 
          errorCode: "MISSING_REQUIRED_FIELDS",
          message: "Title and business ID are required." 
        });
    }

    // Verify business exists and user has access
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ 
        errorCode: "BUSINESS_NOT_FOUND",
        message: "Business not found." 
      });
    }

    // Verify user is part of the business
    const user = await User.findById(userId);
    if (user.businessId?.toString() !== businessId) {
      return res.status(403)
        .json({ 
          errorCode: "UNAUTHORIZED_ACTION",
          message: "You don't have access to this business." 
        });
    }

    const board = await KanbanBoard.create({
      title,
      description: description || "",
      business: businessId,
      createdBy: userId,
      members: [userId],
    });

    const populatedBoard = await KanbanBoard.findById(board._id)
      .populate("createdBy", "firstName lastName email avatar")
      .populate("members", "firstName lastName email avatar");

    res.status(201).json({
      message: "Board created successfully.",
      messageCode: "BOARD_CREATED",
      data: populatedBoard
    });
  } catch (error) {
    console.error("Error creating board:", error);
    res.status(500).json({ 
      errorCode: "CREATE_BOARD_FAILED",
      message: "Failed to create board." 
    });
  }
};

export const updateBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, members } = req.body;

    const board = await KanbanBoard.findById(id);
    if (!board) {
      return res.status(404).json({ 
        errorCode: "BOARD_NOT_FOUND",
        message: "Board not found." 
      });
    }

    if (title) board.title = title;
    if (description !== undefined) board.description = description;
    if (members) board.members = members;

    await board.save();

    const updatedBoard = await KanbanBoard.findById(id)
      .populate("createdBy", "firstName lastName email avatar")
      .populate("members", "firstName lastName email avatar");

    res.status(200).json({
      message: "Board updated successfully.",
      messageCode: "BOARD_UPDATED",
      data: updatedBoard
    });
  } catch (error) {
    console.error("Error updating board:", error);
    res.status(500).json({ 
      errorCode: "UPDATE_BOARD_FAILED",
      message: "Failed to update board." 
    });
  }
};

export const deleteBoard = async (req, res) => {
  try {
    const { id } = req.params;

    const board = await KanbanBoard.findById(id);
    if (!board) {
      return res.status(404).json({ 
        errorCode: "BOARD_NOT_FOUND",
        message: "Board not found." 
      });
    }

    // Delete all columns and cards associated with this board
    const columns = await KanbanColumn.find({ boardId: id });
    const columnIds = columns.map((col) => col._id);

    await KanbanCard.deleteMany({ columnId: { $in: columnIds } });
    await KanbanColumn.deleteMany({ boardId: id });
    await KanbanBoard.findByIdAndDelete(id);

    res.status(200).json({ 
      message: "Board deleted successfully.",
      messageCode: "BOARD_DELETED"
    });
  } catch (error) {
    console.error("Error deleting board:", error);
    res.status(500).json({ 
      errorCode: "DELETE_BOARD_FAILED",
      message: "Failed to delete board." 
    });
  }
};

// ===== COLUMN CONTROLLERS =====

export const createColumn = async (req, res) => {
  try {
    const { title, color, boardId, limit } = req.body;

    if (!title || !color || !boardId) {
      return res.status(400)
        .json({ 
          errorCode: "MISSING_REQUIRED_FIELDS",
          message: "Title, color, and board ID are required." 
        });
    }

    // Get the current max order for this board
    const maxOrderColumn = await KanbanColumn.findOne({ boardId }).sort({
      order: -1,
    });
    const order = maxOrderColumn ? maxOrderColumn.order + 1 : 0;

    const column = await KanbanColumn.create({
      title,
      color,
      order,
      limit: limit || null,
      boardId,
    });

    res.status(201).json({
      message: "Column created successfully.",
      messageCode: "COLUMN_CREATED",
      data: column
    });
  } catch (error) {
    console.error("Error creating column:", error);
    res.status(500).json({ 
      errorCode: "CREATE_COLUMN_FAILED",
      message: "Failed to create column." 
    });
  }
};

export const updateColumn = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, color, limit, order } = req.body;

    const column = await KanbanColumn.findById(id);
    if (!column) {
      return res.status(404).json({ 
        errorCode: "COLUMN_NOT_FOUND",
        message: "Column not found." 
      });
    }

    if (title) column.title = title;
    if (color) column.color = color;
    if (limit !== undefined) column.limit = limit;
    if (order !== undefined) column.order = order;

    await column.save();

    res.status(200).json({
      message: "Column updated successfully.",
      messageCode: "COLUMN_UPDATED",
      data: column
    });
  } catch (error) {
    console.error("Error updating column:", error);
    res.status(500).json({ 
      errorCode: "UPDATE_COLUMN_FAILED",
      message: "Failed to update column." 
    });
  }
};

export const deleteColumn = async (req, res) => {
  try {
    const { id } = req.params;

    const column = await KanbanColumn.findById(id);
    if (!column) {
      return res.status(404).json({ 
        errorCode: "COLUMN_NOT_FOUND",
        message: "Column not found." 
      });
    }

    // Delete all cards in this column
    await KanbanCard.deleteMany({ columnId: id });
    await KanbanColumn.findByIdAndDelete(id);

    res.status(200).json({ 
      message: "Column deleted successfully.",
      messageCode: "COLUMN_DELETED"
    });
  } catch (error) {
    console.error("Error deleting column:", error);
    res.status(500).json({ 
      errorCode: "DELETE_COLUMN_FAILED",
      message: "Failed to delete column." 
    });
  }
};

export const reorderColumns = async (req, res) => {
  try {
    const { columns } = req.body;

    if (!Array.isArray(columns)) {
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Columns array is required." 
      });
    }

    // Update order for each column
    const updates = columns.map((col, index) =>
      KanbanColumn.findByIdAndUpdate(col._id, { order: index })
    );

    await Promise.all(updates);

    res.status(200).json({ 
      message: "Columns reordered successfully.",
      messageCode: "COLUMNS_REORDERED"
    });
  } catch (error) {
    console.error("Error reordering columns:", error);
    res.status(500).json({ 
      errorCode: "REORDER_COLUMNS_FAILED",
      message: "Failed to reorder columns." 
    });
  }
};

// ===== CARD CONTROLLERS =====

export const createCard = async (req, res) => {
  try {
    const {
      title,
      description,
      startDate,
      endDate,
      priority,
      status,
      columnId,
      assignedUsers,
    } = req.body;
    const userId = req.user.id;

    if (!title || !columnId) {
      return res.status(400)
        .json({ 
          errorCode: "MISSING_REQUIRED_FIELDS",
          message: "Title and column ID are required." 
        });
    }

    // Verify column exists
    const column = await KanbanColumn.findById(columnId);
    if (!column) {
      return res.status(404).json({ 
        errorCode: "COLUMN_NOT_FOUND",
        message: "Column not found." 
      });
    }

    // Get board and verify business context
    const board = await KanbanBoard.findById(column.boardId);
    if (!board) {
      return res.status(404).json({ 
        errorCode: "BOARD_NOT_FOUND",
        message: "Board not found." 
      });
    }

    // Validate assigned users are from the same business
    if (assignedUsers && assignedUsers.length > 0) {
      const users = await User.find({
        _id: { $in: assignedUsers },
        businessId: board.business,
      });

      if (users.length !== assignedUsers.length) {
        return res.status(400).json({
          message: "All assigned users must be members of this business",
        });
      }
    }

    // Get the current max order for this column
    const maxOrderCard = await KanbanCard.findOne({ columnId }).sort({
      order: -1,
    });
    const order = maxOrderCard ? maxOrderCard.order + 1 : 0;

    const card = await KanbanCard.create({
      title,
      description: description || "",
      startDate: startDate || "",
      endDate: endDate || "",
      priority: priority || "medium",
      status: status || "Planned",
      columnId,
      assignedUsers: assignedUsers || [],
      comments: [],
      attachments: [],
      order,
      createdBy: userId,
    });
    // Alerts for initial assignees
    if (assignedUsers && assignedUsers.length > 0) {
      await Promise.all(
        assignedUsers.map(async (assigneeId) => {
          try {
            const alert = await Alert.create({
              staff: assigneeId,
              businessId: board.business,
              type: "kanban_assignment",
              messageKey: "ALERTS.KANBAN_ASSIGNMENT",
              params: { cardTitle: title },
              isRead: false,
            });
            io.to(String(assigneeId)).emit("newAlert", {
              type: "kanban_assignment",
              messageKey: "ALERTS.KANBAN_ASSIGNMENT",
              params: { cardTitle: title },
              cardId: card._id,
              title,
              _id: alert._id,
            });
          } catch (e) {
            console.warn("Kanban assignment alert failed", e.message);
          }
        })
      );
    }

    const populatedCard = await KanbanCard.findById(card._id)
      .populate("assignedUsers", "firstName lastName email avatar")
      .populate("createdBy", "firstName lastName email avatar");

    res.status(201).json({
      message: "Card created successfully.",
      messageCode: "CARD_CREATED",
      data: populatedCard
    });
  } catch (error) {
    console.error("Error creating card:", error);
    res.status(500).json({ 
      errorCode: "CREATE_CARD_FAILED",
      message: "Failed to create card." 
    });
  }
};

export const updateCard = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      startDate,
      endDate,
      priority,
      status,
      columnId,
      assignedUsers,
      order,
    } = req.body;

    const card = await KanbanCard.findById(id);
    if (!card) {
      return res.status(404).json({ 
        errorCode: "CARD_NOT_FOUND",
        message: "Card not found." 
      });
    }

    // If columnId is changing, verify it exists
    if (columnId && columnId !== card.columnId.toString()) {
      const column = await KanbanColumn.findById(columnId);
      if (!column) {
        return res.status(404).json({ 
          errorCode: "COLUMN_NOT_FOUND",
          message: "Column not found." 
        });
      }
      card.columnId = columnId;
    }

    // Validate assigned users if provided
    let newlyAdded = [];
    if (assignedUsers) {
      const column = await KanbanColumn.findById(card.columnId);
      const board = await KanbanBoard.findById(column.boardId);

      const users = await User.find({
        _id: { $in: assignedUsers },
        businessId: board.business,
      });

      if (users.length !== assignedUsers.length) {
        return res.status(400).json({
          errorCode: "INVALID_ASSIGNED_USERS",
          message: "All assigned users must be members of this business.",
        });
      }

      const prevAssigned = card.assignedUsers.map((id) => id.toString());
      card.assignedUsers = assignedUsers;
      newlyAdded = assignedUsers.filter(
        (id) => !prevAssigned.includes(id.toString())
      );
    }

    if (title) card.title = title;
    if (description !== undefined) card.description = description;
    if (startDate !== undefined) card.startDate = startDate;
    if (endDate !== undefined) card.endDate = endDate;
    if (priority) card.priority = priority;
    if (status) card.status = status;
    if (order !== undefined) card.order = order;

    await card.save();

    const updatedCard = await KanbanCard.findById(id)
      .populate("assignedUsers", "firstName lastName email avatar")
      .populate("createdBy", "firstName lastName email avatar")
      .populate("comments.userId", "firstName lastName email avatar")
      .populate("attachments.uploadedBy", "firstName lastName email avatar");

    if (newlyAdded.length > 0) {
      const column = await KanbanColumn.findById(updatedCard.columnId);
      const board = await KanbanBoard.findById(column.boardId);
      await Promise.all(
        newlyAdded.map(async (assigneeId) => {
          try {
            const alert = await Alert.create({
              staff: assigneeId,
              businessId: board.business,
              type: "kanban_assignment",
              messageKey: "ALERTS.KANBAN_ASSIGNMENT",
              params: { cardTitle: updatedCard.title },
              isRead: false,
            });
            io.to(String(assigneeId)).emit("newAlert", {
              type: "kanban_assignment",
              messageKey: "ALERTS.KANBAN_ASSIGNMENT",
              params: { cardTitle: updatedCard.title },
              cardId: updatedCard._id,
              title: updatedCard.title,
              _id: alert._id,
            });
          } catch (e) {
            console.warn("Kanban assignment alert (update) failed", e.message);
          }
        })
      );
    }

    res.status(200).json({
      message: "Card updated successfully.",
      messageCode: "CARD_UPDATED",
      data: updatedCard
    });
  } catch (error) {
    console.error("Error updating card:", error);
    res.status(500).json({ 
      errorCode: "UPDATE_CARD_FAILED",
      message: "Failed to update card." 
    });
  }
};

export const deleteCard = async (req, res) => {
  try {
    const { id } = req.params;

    const card = await KanbanCard.findById(id);
    if (!card) {
      return res.status(404).json({ 
        errorCode: "CARD_NOT_FOUND",
        message: "Card not found." 
      });
    }

    await KanbanCard.findByIdAndDelete(id);

    res.status(200).json({ 
      message: "Card deleted successfully.",
      messageCode: "CARD_DELETED"
    });
  } catch (error) {
    console.error("Error deleting card:", error);
    res.status(500).json({ 
      errorCode: "DELETE_CARD_FAILED",
      message: "Failed to delete card." 
    });
  }
};

export const reorderCards = async (req, res) => {
  try {
    const { cards } = req.body;

    if (!Array.isArray(cards)) {
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Cards array is required." 
      });
    }

    // Update order and columnId for each card
    const updates = cards.map((cardData) =>
      KanbanCard.findByIdAndUpdate(cardData._id, {
        order: cardData.order,
        columnId: cardData.columnId,
      })
    );

    await Promise.all(updates);

    res.status(200).json({ 
      message: "Cards reordered successfully.",
      messageCode: "CARDS_REORDERED"
    });
  } catch (error) {
    console.error("Error reordering cards:", error);
    res.status(500).json({ 
      errorCode: "REORDER_CARDS_FAILED",
      message: "Failed to reorder cards." 
    });
  }
};

// ===== COMMENT CONTROLLERS =====

export const addComment = async (req, res) => {
  try {
    const { cardId } = req.params;
    const { text, parentId } = req.body;
    const userId = req.user.id;

    if (!text) {
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Comment text is required." 
      });
    }

    const card = await KanbanCard.findById(cardId);
    if (!card) {
      return res.status(404).json({ 
        errorCode: "CARD_NOT_FOUND",
        message: "Card not found." 
      });
    }

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      text,
      parentId: parentId || null,
      replies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (parentId) {
      // Add as a reply to existing comment
      const addReplyToComment = (comments) => {
        for (let comment of comments) {
          if (comment._id.toString() === parentId) {
            comment.replies.push(newComment._id);
            return true;
          }
          if (comment.replies && comment.replies.length > 0) {
            if (addReplyToComment(comment.replies)) return true;
          }
        }
        return false;
      };

      if (!addReplyToComment(card.comments)) {
        return res.status(404).json({ 
          errorCode: "COMMENT_NOT_FOUND",
          message: "Parent comment not found." 
        });
      }
    }

    card.comments.push(newComment);
    await card.save();

    const updatedCard = await KanbanCard.findById(cardId)
      .populate("comments.userId", "firstName lastName email avatar")
      .populate("assignedUsers", "firstName lastName email avatar")
      .populate("createdBy", "firstName lastName email avatar");

    res.status(201).json({
      message: "Comment added successfully.",
      messageCode: "COMMENT_ADDED",
      data: updatedCard
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ 
      errorCode: "ADD_COMMENT_FAILED",
      message: "Failed to add comment." 
    });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { cardId, commentId } = req.params;

    const card = await KanbanCard.findById(cardId);
    if (!card) {
      return res.status(404).json({ 
        errorCode: "CARD_NOT_FOUND",
        message: "Card not found." 
      });
    }

    // Remove comment and its replies
    const removeComment = (comments) => {
      return comments.filter((comment) => {
        if (comment._id.toString() === commentId) {
          return false;
        }
        if (comment.replies && comment.replies.length > 0) {
          comment.replies = removeComment(comment.replies);
        }
        return true;
      });
    };

    card.comments = removeComment(card.comments);
    await card.save();

    const updatedCard = await KanbanCard.findById(cardId)
      .populate("comments.userId", "firstName lastName email avatar")
      .populate("assignedUsers", "firstName lastName email avatar")
      .populate("createdBy", "firstName lastName email avatar");

    res.status(200).json({
      message: "Comment deleted successfully.",
      messageCode: "COMMENT_DELETED",
      data: updatedCard
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ 
      errorCode: "DELETE_COMMENT_FAILED",
      message: "Failed to delete comment." 
    });
  }
};

// ===== ATTACHMENT CONTROLLERS =====

export const addAttachment = async (req, res) => {
  try {
    const { cardId } = req.params;
    const { fileName, fileUrl, fileSize, fileType } = req.body;
    const userId = req.user.id;

    if (!fileName || !fileUrl || !fileSize || !fileType) {
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "All file details are required." 
      });
    }

    const card = await KanbanCard.findById(cardId);
    if (!card) {
      return res.status(404).json({ 
        errorCode: "CARD_NOT_FOUND",
        message: "Card not found." 
      });
    }

    const newAttachment = {
      _id: new mongoose.Types.ObjectId(),
      fileName,
      fileUrl,
      fileSize,
      fileType,
      uploadedBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    card.attachments.push(newAttachment);
    await card.save();

    const updatedCard = await KanbanCard.findById(cardId)
      .populate("attachments.uploadedBy", "firstName lastName email avatar")
      .populate("assignedUsers", "firstName lastName email avatar")
      .populate("createdBy", "firstName lastName email avatar");

    res.status(201).json({
      message: "Attachment added successfully.",
      messageCode: "ATTACHMENT_ADDED",
      data: updatedCard
    });
  } catch (error) {
    console.error("Error adding attachment:", error);
    res.status(500).json({ 
      errorCode: "ADD_ATTACHMENT_FAILED",
      message: "Failed to add attachment." 
    });
  }
};

export const deleteAttachment = async (req, res) => {
  try {
    const { cardId, attachmentId } = req.params;

    const card = await KanbanCard.findById(cardId);
    if (!card) {
      return res.status(404).json({ 
        errorCode: "CARD_NOT_FOUND",
        message: "Card not found." 
      });
    }

    card.attachments = card.attachments.filter(
      (att) => att._id.toString() !== attachmentId
    );
    await card.save();

    const updatedCard = await KanbanCard.findById(cardId)
      .populate("attachments.uploadedBy", "firstName lastName email avatar")
      .populate("assignedUsers", "firstName lastName email avatar")
      .populate("createdBy", "firstName lastName email avatar");

    res.status(200).json({
      message: "Attachment deleted successfully.",
      messageCode: "ATTACHMENT_DELETED",
      data: updatedCard
    });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    res.status(500).json({ 
      errorCode: "DELETE_ATTACHMENT_FAILED",
      message: "Failed to delete attachment." 
    });
  }
};

// ===== GET BUSINESS MEMBERS =====

export const getBusinessMembers = async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId) {
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Business ID is required." 
      });
    }

    const members = await User.find({ businessId })
      .select("firstName lastName email avatar role")
      .sort({ firstName: 1 });

    res.status(200).json(members);
  } catch (error) {
    console.error("Error fetching business members:", error);
    res.status(500).json({ 
      errorCode: "FETCH_BUSINESS_MEMBERS_FAILED",
      message: "Failed to fetch business members." 
    });
  }
};
