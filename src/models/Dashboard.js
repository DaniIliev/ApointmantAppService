import mongoose from "mongoose";

const GridLayoutSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
  },
  { _id: false }
);

const ResponsiveLayoutSchema = new mongoose.Schema(
  {
    desktop: { type: GridLayoutSchema, required: false },
    mobile: { type: GridLayoutSchema, required: false },
  },
  { _id: false }
);

const SeriesConfigSchema = new mongoose.Schema(
  {
    barSeries: [{ type: String }],
    lineSeries: [{ type: String }],
  },
  { _id: false }
);

const ChartConfigurationSchema = new mongoose.Schema(
  {
    dataSource: { type: String },
    dimension: { type: String }, // e.g., time_series, by_service, by_staff, by_status
    groupBy: { type: String }, // day|week|month
    metric: { type: String },
    staffId: { type: String },
    serviceId: { type: String },
    status: { type: String },
    timeRange: { type: String }, // last7days|last30days|thismonth|custom
    from: { type: String },
    to: { type: String },
    locationId: { type: String },
  },
  { _id: false }
);

const DashboardItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // frontend-provided stable id
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["kpi", "line", "bar", "column", "pie", "linebar", "hbar"],
      required: true,
    },
    // Chart mapping
    dataKey: { type: String },
    dataKeys: [{ type: String }],
    xAxisKey: { type: String },
    colors: [{ type: String }],
    seriesConfig: { type: SeriesConfigSchema },
    configuration: { type: ChartConfigurationSchema },
    // KPI specific
    kpiType: {
      type: String,
      enum: [
        "totalAppointments",
        "totalRevenue",
        "completedAppointments",
        "cancelledAppointments",
        "averageServicePrice",
        "clientRetentionRate",
        "newClientsAcquired",
      ],
    },
    // Layout
    layout: { type: GridLayoutSchema },
    responsiveLayout: { type: ResponsiveLayoutSchema },
  },
  { _id: false }
);

const DashboardSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    items: { type: [DashboardItemSchema], default: [] },
  },
  { timestamps: true }
);

DashboardSchema.index({ owner: 1, business: 1 }, { unique: true });

export default mongoose.model("Dashboard", DashboardSchema);
