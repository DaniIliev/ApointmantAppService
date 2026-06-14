import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedAt: {
      type: Date,
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const lastMessageSchema = new mongoose.Schema(
  {
    text: { type: String },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    senderName: { type: String },
    sentAt: { type: Date },
    type: {
      type: String,
      enum: ["text", "image", "file", "voice", "system"],
      default: "text",
    },
  },
  { _id: false }
);

const channelSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "admin_support",
        "location",
        "business",
        "direct",
        "group",
        "client_location",
      ],
      required: true,
    },
    name: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    avatar: {
      type: String, // Cloudinary URL
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
    },
    members: [memberSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    lastMessage: {
      type: lastMessageSchema,
      default: null,
    },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

// Indexes for fast queries
channelSchema.index({ "members.user": 1 });
channelSchema.index({ type: 1, businessId: 1 });
channelSchema.index({ type: 1, locationId: 1 });
channelSchema.index({ updatedAt: -1 });

export default mongoose.model("Channel", channelSchema);
