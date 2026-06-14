import Channel from "../models/Channel.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { io } from "../index.js";
import cloudinary from "../cloudinaryConfig.js";

// ─── GET USER CHANNELS ──────────────────────────────────────────
export const getChannels = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const channels = await Channel.find({
      "members.user": userId,
      isArchived: false,
    })
      .populate("members.user", "firstName lastName profilePictureUrl email role")
      .populate("businessId", "businessName")
      .sort({ updatedAt: -1 })
      .lean();

    // Compute unread count for each channel
    const enriched = channels.map((ch) => {
      const memberInfo = ch.members.find(
        (m) => m.user._id.toString() === userId.toString()
      );
      const lastRead = memberInfo?.lastReadAt || new Date(0);

      return {
        ...ch,
        unreadCount: 0, // Will be computed lazily or via aggregation
        isMuted: memberInfo?.isMuted || false,
        isBlocked: memberInfo?.isBlocked || false,
      };
    });

    res.json({ data: enriched });
  } catch (error) {
    console.error("Error fetching channels:", error);
    res.status(500).json({ message: "Error fetching channels" });
  }
};

// ─── GET CHANNEL DETAILS ─────────────────────────────────────────
export const getChannel = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const channel = await Channel.findOne({
      _id: id,
      "members.user": userId,
    }).populate(
      "members.user",
      "firstName lastName profilePictureUrl email role"
    );

    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    res.json({ data: channel });
  } catch (error) {
    console.error("Error fetching channel:", error);
    res.status(500).json({ message: "Error fetching channel" });
  }
};

// ─── CREATE CHANNEL (direct / group) ─────────────────────────────
export const createChannel = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { type, name, description, memberIds } = req.body;

    if (!["direct", "group"].includes(type)) {
      return res
        .status(400)
        .json({ message: "Can only create direct or group channels" });
    }

    // For direct messages, check if channel already exists
    if (type === "direct") {
      if (!memberIds || memberIds.length !== 1) {
        return res
          .status(400)
          .json({ message: "Direct channel requires exactly one other user" });
      }

      const otherUserId = memberIds[0];

      // Check existing direct channel between these two users
      const existing = await Channel.findOne({
        type: "direct",
        "members.user": { $all: [userId, otherUserId] },
        $expr: { $eq: [{ $size: "$members" }, 2] },
      });

      if (existing) {
        const populated = await Channel.findById(existing._id).populate(
          "members.user",
          "firstName lastName profilePictureUrl email role"
        );
        return res.json({ data: populated });
      }
    }

    // Validate memberIds
    if (memberIds && memberIds.length > 0) {
      const users = await User.find({ _id: { $in: memberIds } }).select("_id");
      if (users.length !== memberIds.length) {
        return res.status(400).json({ message: "Some users not found" });
      }
    }

    const members = [
      { user: userId, role: "owner", joinedAt: new Date() },
      ...(memberIds || []).map((id) => ({
        user: id,
        role: "member",
        joinedAt: new Date(),
      })),
    ];

    const channel = await Channel.create({
      type,
      name: type === "group" ? name || "New Group" : undefined,
      description: type === "group" ? description : undefined,
      members,
      createdBy: userId,
    });

    const populated = await Channel.findById(channel._id).populate(
      "members.user",
      "firstName lastName profilePictureUrl email role"
    );

    // Notify all members via socket
    memberIds?.forEach((memberId) => {
      io.to(memberId.toString()).emit("channelCreated", populated);
    });

    res.status(201).json({ data: populated });
  } catch (error) {
    console.error("Error creating channel:", error);
    res.status(500).json({ message: "Error creating channel" });
  }
};

// ─── UPDATE CHANNEL ──────────────────────────────────────────────
export const updateChannel = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { name, description, avatar } = req.body;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    // Only owner/admin can update
    const member = channel.members.find(
      (m) => m.user.toString() === userId.toString()
    );
    if (!member || !["owner", "admin"].includes(member.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (name !== undefined) channel.name = name;
    if (description !== undefined) channel.description = description;
    if (avatar !== undefined) channel.avatar = avatar;

    await channel.save();

    const populated = await Channel.findById(id).populate(
      "members.user",
      "firstName lastName profilePictureUrl email role"
    );

    // Notify members
    channel.members.forEach((m) => {
      io.to(m.user.toString()).emit("channelUpdated", populated);
    });

    res.json({ data: populated });
  } catch (error) {
    console.error("Error updating channel:", error);
    res.status(500).json({ message: "Error updating channel" });
  }
};

// ─── DELETE / ARCHIVE CHANNEL ────────────────────────────────────
export const deleteChannel = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const member = channel.members.find(
      (m) => m.user.toString() === userId.toString()
    );
    if (!member) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (channel.type === "group" && member.role !== "owner") {
      return res.status(403).json({ message: "Only owner can delete group" });
    }

    // Only allow deleting group/direct channels
    if (!["group", "direct"].includes(channel.type)) {
      return res
        .status(400)
        .json({ message: "Cannot delete system channels" });
    }

    channel.isArchived = true;
    await channel.save();

    // Notify members
    channel.members.forEach((m) => {
      io.to(m.user.toString()).emit("channelArchived", { channelId: id });
    });

    res.json({ message: "Channel archived" });
  } catch (error) {
    console.error("Error deleting channel:", error);
    res.status(500).json({ message: "Error deleting channel" });
  }
};

// ─── ADD MEMBER ──────────────────────────────────────────────────
export const addMember = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { userIds } = req.body;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const member = channel.members.find(
      (m) => m.user.toString() === userId.toString()
    );
    if (!member || !["owner", "admin"].includes(member.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    for (const uid of userIds) {
      const alreadyMember = channel.members.some(
        (m) => m.user.toString() === uid.toString()
      );
      if (!alreadyMember) {
        channel.members.push({
          user: uid,
          role: "member",
          joinedAt: new Date(),
        });
      }
    }

    await channel.save();

    const populated = await Channel.findById(id).populate(
      "members.user",
      "firstName lastName profilePictureUrl email role"
    );

    // Notify new members
    userIds.forEach((uid) => {
      io.to(uid.toString()).emit("channelCreated", populated);
    });

    // Notify existing members
    channel.members.forEach((m) => {
      io.to(m.user.toString()).emit("memberAdded", {
        channelId: id,
        userIds,
      });
    });

    res.json({ data: populated });
  } catch (error) {
    console.error("Error adding member:", error);
    res.status(500).json({ message: "Error adding member" });
  }
};

// ─── REMOVE MEMBER ───────────────────────────────────────────────
export const removeMember = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id, userId: targetUserId } = req.params;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const member = channel.members.find(
      (m) => m.user.toString() === userId.toString()
    );

    // Self-leave is always allowed; otherwise need owner/admin
    const isSelfLeave = userId.toString() === targetUserId.toString();
    if (!isSelfLeave && (!member || !["owner", "admin"].includes(member.role))) {
      return res.status(403).json({ message: "Not authorized" });
    }

    channel.members = channel.members.filter(
      (m) => m.user.toString() !== targetUserId.toString()
    );
    await channel.save();

    // Notify removed user
    io.to(targetUserId.toString()).emit("removedFromChannel", {
      channelId: id,
    });

    res.json({ message: "Member removed" });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ message: "Error removing member" });
  }
};

// ─── BLOCK / UNBLOCK MEMBER ─────────────────────────────────────
export const toggleBlockMember = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id, userId: targetUserId } = req.params;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const requester = channel.members.find(
      (m) => m.user.toString() === userId.toString()
    );
    if (!requester || !["owner", "admin"].includes(requester.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const target = channel.members.find(
      (m) => m.user.toString() === targetUserId.toString()
    );
    if (!target) {
      return res.status(404).json({ message: "Member not found" });
    }

    target.isBlocked = !target.isBlocked;
    target.blockedAt = target.isBlocked ? new Date() : undefined;
    target.blockedBy = target.isBlocked ? userId : undefined;

    await channel.save();

    // Notify blocked user
    io.to(targetUserId.toString()).emit("memberBlocked", {
      channelId: id,
      isBlocked: target.isBlocked,
    });

    res.json({
      data: { isBlocked: target.isBlocked },
      message: target.isBlocked ? "User blocked" : "User unblocked",
    });
  } catch (error) {
    console.error("Error toggling block:", error);
    res.status(500).json({ message: "Error toggling block" });
  }
};

// ─── GET MESSAGES (paginated) ────────────────────────────────────
export const getMessages = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { before, limit = 50 } = req.query;

    // Verify membership
    const channel = await Channel.findOne({
      _id: id,
      "members.user": userId,
    });
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const query = { channel: id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("sender", "firstName lastName profilePictureUrl email")
      .populate("replyTo")
      .lean();

    // Return in chronological order
    res.json({ data: messages.reverse() });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Error fetching messages" });
  }
};

// ─── SEND MESSAGE ────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { text, type = "text", attachments, replyTo } = req.body;

    // Verify membership and not blocked
    const channel = await Channel.findOne({
      _id: id,
      "members.user": userId,
    });
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const member = channel.members.find(
      (m) => m.user.toString() === userId.toString()
    );
    if (member.isBlocked) {
      return res
        .status(403)
        .json({ message: "You are blocked from this channel" });
    }

    const message = await Message.create({
      channel: id,
      sender: userId,
      type,
      text,
      attachments: attachments || [],
      replyTo: replyTo || undefined,
    });

    const populated = await Message.findById(message._id)
      .populate("sender", "firstName lastName profilePictureUrl email")
      .populate("replyTo")
      .lean();

    // Update channel's lastMessage
    const senderUser = await User.findById(userId).select("firstName lastName");
    channel.lastMessage = {
      text:
        type === "text"
          ? text
          : type === "image"
            ? "📷 Image"
            : type === "file"
              ? "📎 File"
              : type === "voice"
                ? "🎤 Voice message"
                : text,
      sender: userId,
      senderName: senderUser
        ? `${senderUser.firstName} ${senderUser.lastName}`
        : "Unknown",
      sentAt: new Date(),
      type,
    };
    await channel.save();

    // Emit to all members in the channel room
    io.to(`channel:${id}`).emit("newChatMessage", populated);

    // Also emit to individual user rooms for notification badge
    channel.members.forEach((m) => {
      if (m.user.toString() !== userId.toString()) {
        io.to(m.user.toString()).emit("chatNotification", {
          channelId: id,
          message: populated,
        });
      }
    });

    res.status(201).json({ data: populated });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Error sending message" });
  }
};

// ─── EDIT MESSAGE ────────────────────────────────────────────────
export const editMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { msgId } = req.params;
    const { text } = req.body;

    const message = await Message.findById(msgId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.sender.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Can only edit your own messages" });
    }

    message.text = text;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(msgId)
      .populate("sender", "firstName lastName profilePictureUrl email")
      .lean();

    io.to(`channel:${message.channel}`).emit("messageEdited", populated);

    res.json({ data: populated });
  } catch (error) {
    console.error("Error editing message:", error);
    res.status(500).json({ message: "Error editing message" });
  }
};

// ─── DELETE MESSAGE (soft) ───────────────────────────────────────
export const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { msgId } = req.params;

    const message = await Message.findById(msgId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Allow sender or channel owner/admin to delete
    if (message.sender.toString() !== userId.toString()) {
      const channel = await Channel.findById(message.channel);
      const member = channel?.members.find(
        (m) => m.user.toString() === userId.toString()
      );
      if (!member || !["owner", "admin"].includes(member.role)) {
        return res.status(403).json({ message: "Not authorized" });
      }
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.text = "";
    message.attachments = [];
    await message.save();

    io.to(`channel:${message.channel}`).emit("messageDeleted", {
      messageId: msgId,
      channelId: message.channel,
    });

    res.json({ message: "Message deleted" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ message: "Error deleting message" });
  }
};

// ─── MARK AS READ ────────────────────────────────────────────────
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    await Channel.updateOne(
      { _id: id, "members.user": userId },
      { $set: { "members.$.lastReadAt": new Date() } }
    );

    io.to(`channel:${id}`).emit("channelRead", {
      channelId: id,
      userId,
      readAt: new Date(),
    });

    // Notify user globally to update their total unread counts in the top navigation
    io.to(userId.toString()).emit("chatReadGlobal");

    res.json({ message: "Marked as read" });
  } catch (error) {
    console.error("Error marking as read:", error);
    res.status(500).json({ message: "Error marking as read" });
  }
};

// ─── UPLOAD FILE ─────────────────────────────────────────────────
export const uploadChatFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    res.json({
      data: {
        url: req.file.path,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Error uploading file" });
  }
};

// ─── SEARCH USERS ────────────────────────────────────────────────
export const searchUsers = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { q, businessId } = req.query;

    if ((!q || q.length < 2) && !businessId) {
      return res.json({ data: [] });
    }

    const query = {
      _id: { $ne: userId },
    };

    if (q && q.length >= 2) {
      const searchRegex = new RegExp(q, "i");
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
      ];
    }

    // If businessId is provided, search within business users
    if (businessId) {
      query.businessId = businessId;
    }

    const users = await User.find(query)
      .select("firstName lastName email profilePictureUrl role")
      .limit(20)
      .lean();

    res.json({ data: users });
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ message: "Error searching users" });
  }
};

// ─── GET UNREAD COUNTS ───────────────────────────────────────────
export const getUnreadCounts = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const channels = await Channel.find({
      "members.user": userId,
      isArchived: false,
    }).lean();

    let totalUnread = 0;
    const channelUnreads = {};

    for (const ch of channels) {
      const member = ch.members.find(
        (m) => m.user.toString() === userId.toString()
      );
      const lastRead = member?.lastReadAt || new Date(0);

      const unread = await Message.countDocuments({
        channel: ch._id,
        sender: { $ne: userId },
        createdAt: { $gt: lastRead },
        isDeleted: false,
      });

      channelUnreads[ch._id] = unread;
      totalUnread += unread;
    }

    res.json({ data: { total: totalUnread, channels: channelUnreads } });
  } catch (error) {
    console.error("Error getting unread counts:", error);
    res.status(500).json({ message: "Error getting unread counts" });
  }
};

// ─── JOIN CLIENT LOCATION CHANNEL ────────────────────────────────
export const joinClientChannel = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { locationId } = req.params;

    const channel = await Channel.findOne({
      type: "client_location",
      locationId,
    });

    if (!channel) {
      return res.status(404).json({ message: "Client channel not found for this location" });
    }

    const alreadyMember = channel.members.some(
      (m) => m.user.toString() === userId.toString()
    );

    if (!alreadyMember) {
      channel.members.push({
        user: userId,
        role: "member",
        joinedAt: new Date(),
      });
      await channel.save();
    }

    const populated = await Channel.findById(channel._id).populate(
      "members.user",
      "firstName lastName profilePictureUrl email role"
    );

    res.json({ data: populated });
  } catch (error) {
    console.error("Error joining client channel:", error);
    res.status(500).json({ message: "Error joining client channel" });
  }
};

// --- Reactions ---
export const toggleReaction = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) return res.status(400).json({ message: "Emoji is required" });

    const message = await Message.findById(messageId).populate("sender", "firstName lastName profilePictureUrl");
    if (!message) return res.status(404).json({ message: "Message not found" });

    const channel = await Channel.findById(message.channel);
    const isMember = channel.members.some((m) => m.user.toString() === userId.toString());
    if (!isMember) return res.status(403).json({ message: "Not a member" });

    // Toggle reaction
    const existingIndex = message.reactions.findIndex(
      (r) => r.emoji === emoji && r.user.toString() === userId.toString()
    );

    if (existingIndex > -1) {
      // Remove
      message.reactions.splice(existingIndex, 1);
    } else {
      // Add
      message.reactions.push({ emoji, user: userId });
    }

    await message.save();

    // Populate sender of message for socket event
    const populated = await Message.findById(message._id)
      .populate("sender", "firstName lastName profilePictureUrl")
      .populate("replyTo")
      .lean();

    io.to(`channel:${channel._id}`).emit("messageEdited", populated);

    res.json({ data: populated });
  } catch (error) {
    console.error("Error toggling reaction:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// --- Invite Links ---
import crypto from "crypto";

export const generateInviteCode = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id: channelId } = req.params;

    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    const member = channel.members.find((m) => m.user.toString() === userId.toString());
    if (!member || !["owner", "admin"].includes(member.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (channel.type !== "group") {
      return res.status(400).json({ message: "Can only generate invites for groups" });
    }

    if (!channel.inviteCode) {
      channel.inviteCode = crypto.randomBytes(4).toString("hex");
      await channel.save();
    }

    res.json({ inviteCode: channel.inviteCode });
  } catch (error) {
    console.error("Error generating invite:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getInviteInfo = async (req, res) => {
  try {
    const { code } = req.params;

    const channel = await Channel.findOne({ inviteCode: code });
    if (!channel) return res.status(404).json({ message: "Invalid invite code" });

    res.json({
      name: channel.name,
      avatar: channel.avatar,
      type: channel.type,
      memberCount: channel.members.length,
    });
  } catch (error) {
    console.error("Error fetching invite:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const joinByInvite = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { code } = req.params;

    const channel = await Channel.findOne({ inviteCode: code });
    if (!channel) return res.status(404).json({ message: "Invalid invite code" });

    const alreadyMember = channel.members.some((m) => m.user.toString() === userId.toString());
    if (!alreadyMember) {
      channel.members.push({
        user: userId,
        role: "member",
        joinedAt: new Date(),
      });
      await channel.save();
    }

    const populated = await Channel.findById(channel._id).populate(
      "members.user",
      "firstName lastName profilePictureUrl email role"
    );

    res.json({ data: populated });
  } catch (error) {
    console.error("Error joining by invite:", error);
    res.status(500).json({ message: "Server error" });
  }
};
