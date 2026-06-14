import Channel from "../models/Channel.js";
import User from "../models/User.js";

/**
 * Ensure an admin_support channel exists for a given user.
 * Called after registration or first login.
 */
export async function ensureAdminSupportChannel(userId) {
  const existing = await Channel.findOne({
    type: "admin_support",
    "members.user": userId,
  });
  if (existing) return existing;

  // Find all admin users
  const admins = await User.find({ role: "admin" }).select("_id");
  if (admins.length === 0) {
    console.warn("No admin users found, skipping admin_support channel creation");
    return null;
  }

  const members = [
    { user: userId, role: "member", joinedAt: new Date() },
    ...admins.map((admin) => ({
      user: admin._id,
      role: "admin",
      joinedAt: new Date(),
    })),
  ];

  const channel = await Channel.create({
    type: "admin_support",
    name: "Support",
    members,
    createdBy: userId,
  });

  if (admins.length > 0) {
    const Message = (await import("../models/Message.js")).default;
    const adminId = admins[0]._id;
    const adminUser = await User.findById(adminId);
    
    await Message.create({
      channel: channel._id,
      sender: adminId,
      type: "text",
      text: "Здравейте! Как можем да ви помогнем днес?",
    });

    channel.lastMessage = {
      text: "Здравейте! Как можем да ви помогнем днес?",
      sender: adminId,
      senderName: adminUser ? `${adminUser.firstName} ${adminUser.lastName}` : "Support",
      sentAt: new Date(),
      type: "text"
    };
    await channel.save();
  }

  return channel;
}

/**
 * Ensure a business-wide general channel exists.
 * Called when a business is created or when staff join.
 */
export async function ensureBusinessChannel(businessId, ownerUserId) {
  const existing = await Channel.findOne({
    type: "business",
    businessId,
  });
  if (existing) return existing;

  const channel = await Channel.create({
    type: "business",
    name: "General",
    description: "Business-wide general channel",
    businessId,
    members: [{ user: ownerUserId, role: "owner", joinedAt: new Date() }],
    createdBy: ownerUserId,
  });

  return channel;
}

/**
 * Ensure a location staff channel exists.
 * Called when a location is created.
 */
export async function ensureLocationChannel(businessId, locationId, locationName, creatorUserId) {
  const existing = await Channel.findOne({
    type: "location",
    locationId,
  });
  if (existing) return existing;

  const channel = await Channel.create({
    type: "location",
    name: locationName,
    businessId,
    locationId,
    members: [{ user: creatorUserId, role: "owner", joinedAt: new Date() }],
    createdBy: creatorUserId,
  });

  return channel;
}

/**
 * Ensure a client-facing location channel exists.
 * Called when a location is created — shared with clients.
 */
export async function ensureClientLocationChannel(businessId, locationId, locationName, creatorUserId) {
  const existing = await Channel.findOne({
    type: "client_location",
    locationId,
  });
  if (existing) return existing;

  const channel = await Channel.create({
    type: "client_location",
    name: `${locationName} — Clients`,
    description: "Public channel for client communication",
    businessId,
    locationId,
    members: [{ user: creatorUserId, role: "owner", joinedAt: new Date() }],
    createdBy: creatorUserId,
  });

  return channel;
}

/**
 * Add a user to the business channel and all relevant location channels.
 * Called when staff is added to a business.
 */
export async function addUserToBusinessChannels(userId, businessId, locationIds = []) {
  // Add to business general channel
  const bizChannel = await Channel.findOne({ type: "business", businessId });
  if (bizChannel) {
    const alreadyMember = bizChannel.members.some(
      (m) => m.user.toString() === userId.toString()
    );
    if (!alreadyMember) {
      bizChannel.members.push({ user: userId, role: "member", joinedAt: new Date() });
      await bizChannel.save();
    }
  }

  // Add to location channels
  for (const locId of locationIds) {
    const locChannel = await Channel.findOne({ type: "location", locationId: locId });
    if (locChannel) {
      const alreadyMember = locChannel.members.some(
        (m) => m.user.toString() === userId.toString()
      );
      if (!alreadyMember) {
        locChannel.members.push({ user: userId, role: "member", joinedAt: new Date() });
        await locChannel.save();
      }
    }
  }
}

/**
 * Add a client user to a client_location channel.
 */
export async function addClientToLocationChannel(userId, locationId) {
  const channel = await Channel.findOne({ type: "client_location", locationId });
  if (!channel) return null;

  const alreadyMember = channel.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (alreadyMember) return channel;

  channel.members.push({ user: userId, role: "member", joinedAt: new Date() });
  await channel.save();

  return channel;
}

/**
 * Remove a user from all channels of a business (when staff is removed).
 */
export async function removeUserFromBusinessChannels(userId, businessId) {
  await Channel.updateMany(
    { businessId, "members.user": userId },
    { $pull: { members: { user: userId } } }
  );
}
