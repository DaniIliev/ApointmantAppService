import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true }, // Cloudinary URL
    type: {
      type: String,
      enum: ["image", "file", "voice"],
      required: true,
    },
    name: { type: String }, // Original filename
    size: { type: Number }, // Size in bytes
    duration: { type: Number }, // Duration in seconds (for voice)
    mimeType: { type: String },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { _id: false }
);

const readReceiptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "voice", "system"],
      default: "text",
    },
    text: {
      type: String,
      maxlength: 5000,
    },
    attachments: [attachmentSchema],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    readBy: [readReceiptSchema],
    reactions: [reactionSchema],
  },
  { timestamps: true }
);

// Indexes for fast message retrieval
messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

export default mongoose.model("Message", messageSchema);
