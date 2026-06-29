import mongoose from "mongoose";
import Dashboard from "../models/Dashboard.js";

const getOrCreateDashboard = async (ownerId, businessId) => {
  const filter = {
    owner: ownerId,
    business: businessId,
  };

  try {
    return await Dashboard.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          owner: ownerId,
          business: businessId,
          items: [],
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await Dashboard.findOne(filter).lean();
      if (existing) return existing;
    }

    throw err;
  }
};

export const getDashboard = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const userRole = req.user?.role;
    const businessId = req.user?.businessId;

    if (userRole === "personal") {
      return res.json({
        owner: ownerId,
        items: [
          {
            id: "client-spent-kpi",
            type: "kpi",
            title: "Spent Momentum",
            kpiType: "totalRevenue",
            layout: { x: 0, y: 0, w: 6, h: 2 },
          },
          {
            id: "client-appointments-kpi",
            type: "kpi",
            title: "Total Appointments",
            kpiType: "totalAppointments",
            layout: { x: 6, y: 0, w: 6, h: 2 },
          },
          {
            id: "client-spent-chart",
            type: "line",
            title: "Spent Dynamics",
            configuration: {
              dataSource: "revenue",
              dimension: "time_series",
              metric: "revenue",
            },
            layout: { x: 0, y: 2, w: 12, h: 4 },
          },
          {
            id: "client-appointments-chart",
            type: "bar",
            title: "Appointments Dynamics",
            configuration: {
              dataSource: "appointments",
              dimension: "time_series",
              metric: "total",
            },
            layout: { x: 0, y: 6, w: 12, h: 4 },
          },
          {
            id: "client-services-pie",
            type: "pie",
            title: "Services Breakdown",
            configuration: {
              dataSource: "appointments",
              dimension: "by_service",
              metric: "count",
            },
            layout: { x: 0, y: 10, w: 6, h: 4 },
          },
          {
            id: "client-status-pie",
            type: "pie",
            title: "Appointments by Status",
            configuration: {
              dataSource: "appointments",
              dimension: "by_status",
              metric: "count",
            },
            layout: { x: 6, y: 10, w: 6, h: 4 },
          },
        ],
      });
    }

    if (!ownerId || !businessId)
      return res.status(400).json({
        errorCode: "MISSING_BUSINESS_CONTEXT",
        message: "Missing user or business context.",
      });
    const dash = await getOrCreateDashboard(ownerId, businessId);
    return res.json(dash);
  } catch (err) {
    return res.status(500).json({
      errorCode: "DASHBOARD_FETCH_FAILED",
      message: "Failed to fetch dashboard.",
      error: err.message,
    });
  }
};

export const addItem = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const businessId = req.user?.businessId;
    if (!ownerId || !businessId)
      return res.status(400).json({
        errorCode: "MISSING_BUSINESS_CONTEXT",
        message: "Missing user or business context.",
      });

    const item = req.body;
    if (!item?.id || !item?.type || !item?.title) {
      return res.status(400).json({
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Item must include id, type, and title.",
      });
    }

    const updated = await Dashboard.findOneAndUpdate(
      { owner: ownerId, business: businessId },
      { $push: { items: item } },
      { upsert: true, new: true },
    ).lean();
    return res.status(201).json({
      message: "Dashboard item added successfully.",
      messageCode: "DASHBOARD_ITEM_ADDED",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({
      errorCode: "ADD_ITEM_FAILED",
      message: "Failed to add item.",
      error: err.message,
    });
  }
};

export const updateItem = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const businessId = req.user?.businessId;
    const { itemId } = req.params;
    if (!ownerId || !businessId)
      return res.status(400).json({
        errorCode: "MISSING_BUSINESS_CONTEXT",
        message: "Missing user or business context.",
      });

    const item = req.body || {};

    const updated = await Dashboard.findOneAndUpdate(
      { owner: ownerId, business: businessId, "items.id": itemId },
      { $set: { "items.$": item } },
      { new: true },
    ).lean();

    if (!updated)
      return res.status(404).json({
        errorCode: "ITEM_NOT_FOUND",
        message: "Item not found.",
      });
    return res.json({
      message: "Dashboard item updated successfully.",
      messageCode: "DASHBOARD_ITEM_UPDATED",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({
      errorCode: "UPDATE_ITEM_FAILED",
      message: "Failed to update item.",
      error: err.message,
    });
  }
};

export const removeItem = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const businessId = req.user?.businessId;
    const { itemId } = req.params;
    if (!ownerId || !businessId)
      return res.status(400).json({
        errorCode: "MISSING_BUSINESS_CONTEXT",
        message: "Missing user or business context.",
      });

    const updated = await Dashboard.findOneAndUpdate(
      { owner: ownerId, business: businessId },
      { $pull: { items: { id: itemId } } },
      { new: true },
    ).lean();
    return res.json({
      message: "Dashboard item removed successfully.",
      messageCode: "DASHBOARD_ITEM_REMOVED",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({
      errorCode: "REMOVE_ITEM_FAILED",
      message: "Failed to remove item.",
      error: err.message,
    });
  }
};

// Save positions in bulk for a particular device (desktop|mobile)
export const saveLayout = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const businessId = req.user?.businessId;
    const { device = "desktop", layout = [] } = req.body || {};
    if (!ownerId || !businessId)
      return res.status(400).json({
        errorCode: "MISSING_BUSINESS_CONTEXT",
        message: "Missing user or business context.",
      });
    if (!["desktop", "mobile"].includes(device))
      return res.status(400).json({
        errorCode: "INVALID_DEVICE",
        message: "Invalid device.",
      });
    if (!Array.isArray(layout))
      return res.status(400).json({
        errorCode: "INVALID_LAYOUT_FORMAT",
        message: "Layout must be an array.",
      });

    const dash = await Dashboard.findOne({
      owner: ownerId,
      business: businessId,
    });
    if (!dash)
      return res.status(404).json({
        errorCode: "DASHBOARD_NOT_FOUND",
        message: "Dashboard not found.",
      });

    const layoutById = new Map(layout.map((l) => [String(l.i), l]));
    dash.items = dash.items.map((it) => {
      const l = layoutById.get(String(it.id));
      if (!l) return it;
      const layoutConfig = { x: l.x, y: l.y, w: l.w, h: l.h };
      const resp = it.responsiveLayout || {};
      resp[device] = layoutConfig;
      return {
        ...(it.toObject?.() ?? it),
        layout: layoutConfig,
        responsiveLayout: resp,
      };
    });

    await dash.save();
    return res.json({
      message: "Dashboard layout saved successfully.",
      messageCode: "DASHBOARD_LAYOUT_SAVED",
      data: dash.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      errorCode: "SAVE_LAYOUT_FAILED",
      message: "Failed to save layout.",
      error: err.message,
    });
  }
};
