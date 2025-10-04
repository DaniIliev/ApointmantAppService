import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";
import mongoose from "mongoose";
import moment from "moment-timezone";

// Помощна функция за определяне на времевия интервал с Moment-Timezone
const getTimeRange = (period, customDateRange, timeZone = "Europe/Sofia") => {
  let startDate;
  let endDate;

  const localTime = moment().tz(timeZone);

  switch (period) {
    case "last7days":
      startDate = localTime.clone().subtract(7, "days").startOf("day").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;

    case "last30days":
      startDate = localTime
        .clone()
        .subtract(30, "days")
        .startOf("day")
        .toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;

    case "thismonth":
      startDate = localTime.clone().startOf("month").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;

    case "lastmonth":
      startDate = localTime
        .clone()
        .subtract(1, "month")
        .startOf("month")
        .toDate();
      endDate = localTime.clone().subtract(1, "month").endOf("month").toDate();
      break;

    case "thisquarter":
      startDate = localTime.clone().startOf("quarter").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;

    case "lastquarter":
      startDate = localTime
        .clone()
        .subtract(1, "quarter")
        .startOf("quarter")
        .toDate();
      endDate = localTime
        .clone()
        .subtract(1, "quarter")
        .endOf("quarter")
        .toDate();
      break;

    case "thisyear":
      startDate = localTime.clone().startOf("year").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;

    case "custom":
      if (customDateRange?.from && customDateRange?.to) {
        // Парсваме като локални дати, за да хванем началото/края на деня
        startDate = moment(customDateRange.from)
          .tz(timeZone)
          .startOf("day")
          .toDate();
        endDate = moment(customDateRange.to).tz(timeZone).endOf("day").toDate();
      } else {
        // Ако custom е избран, но липсват дати, използваме default (last30days)
        startDate = localTime
          .clone()
          .subtract(30, "days")
          .startOf("day")
          .toDate();
        endDate = localTime.clone().endOf("day").toDate();
      }
      break;

    default: // Връщаме default (last30days)
      startDate = localTime
        .clone()
        .subtract(30, "days")
        .startOf("day")
        .toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;
  }

  return { startDate, endDate };
};

// Помощна функция за изчисляване на процентна промяна
const calculateChange = (currentValue, previousValue) => {
  if (previousValue === 0) {
    // Ако предишната стойност е 0, промяната е 100% (ако текущата е > 0)
    return currentValue > 0
      ? { value: 100, type: "increase" }
      : { value: 0, type: "neutral" };
  }

  const changeValue = ((currentValue - previousValue) / previousValue) * 100;
  const type =
    changeValue > 0 ? "increase" : changeValue < 0 ? "decrease" : "neutral";

  return {
    value: Math.abs(changeValue),
    type,
  };
};

export const getPerformanceData = async (req, res) => {
  try {
    const { businessId } = req.user;
    const { period, from, to } = req.query;
    const businessObjectId = new mongoose.Types.ObjectId(businessId);

    // 1. Определяне на времевия интервал (Текущ период)
    const { startDate, endDate } = getTimeRange(period, { from, to });

    // 1.1. Определяне на ВРЕМЕВИТЕ ИНТЕРВАЛИ ЗА ПРЕДИШНИЯ ПЕРИОД
    const timeDiff = endDate.getTime() - startDate.getTime();
    const previousEndDate = startDate; // Краят на предишния е началото на текущия
    const previousStartDate = new Date(startDate.getTime() - timeDiff); // Изваждаме същата дължина

    // Филтри за текущия и предишния период
    const currentPeriodFilter = {
      "appointmentTime.start": { $gte: startDate, $lte: endDate },
      business: businessObjectId,
    };

    const previousPeriodFilter = {
      "appointmentTime.start": {
        $gte: previousStartDate,
        $lte: previousEndDate,
      },
      business: businessObjectId,
    };

    // ----------------------------------------------------
    // --- ФУНКЦИЯ ЗА ИЗЧИСЛЯВАНЕ НА ОСНОВНИ KPI-та ЗА ДАДЕН ФИЛТЪР
    // ----------------------------------------------------

    const calculateKPIs = async (filter) => {
      const appointments = await Appointment.find(filter)
        .populate("service", "price")
        .exec();

      const completedAppointments = appointments.filter(
        (a) => a.status === "completed"
      );
      const totalRevenue = completedAppointments.reduce((sum, appointment) => {
        const price = appointment.service?.price || 0;
        return sum + price;
      }, 0);
      const completedCount = completedAppointments.length;
      const cancelledCount = appointments.filter(
        (a) => a.status === "cancelled"
      ).length;
      const averageServicePrice =
        completedCount > 0 ? totalRevenue / completedCount : 0;

      return {
        appointments, // Връщаме и срещите, за да не ги извличаме повторно
        totalAppointments: appointments.length,
        totalRevenue,
        completedAppointments: completedCount,
        cancelledAppointments: cancelledCount,
        averageServicePrice,
      };
    };

    // 2. Изчисляване на KPI за ТЕКУЩИЯ и ПРЕДИШНИЯ ПЕРИОД
    const currentKPIs = await calculateKPIs(currentPeriodFilter);
    const previousKPIs = await calculateKPIs(previousPeriodFilter);

    // Извличаме срещите за текущия период (за графиките)
    const appointmentsInPeriod = currentKPIs.appointments;

    // ----------------------------------------------------
    // --- ЛОГИКА ЗА КЛИЕНТИ (Нови и Запазване)
    // ----------------------------------------------------

    // **I. New Clients Acquired (Проверка до 1 година назад)**
    const oneYearAgo = moment(endDate).subtract(1, "year").toDate();

    const firstAppointmentDates = await Appointment.aggregate([
      {
        $match: {
          business: businessObjectId,
          "appointmentTime.start": { $gte: oneYearAgo, $lte: endDate }, // Ограничаваме търсенето до 1 година
          clientEmail: { $ne: null, $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$clientEmail",
          firstAppointmentDate: { $min: "$appointmentTime.start" },
        },
      },
    ]);

    // 1. Изчисляваме Нови Клиенти за ТЕКУЩИЯ период
    const newClientEmailsCurrent = firstAppointmentDates
      .filter(
        (client) =>
          client.firstAppointmentDate >= startDate &&
          client.firstAppointmentDate <= endDate
      )
      .map((c) => c._id);
    const newClientsAcquired = newClientEmailsCurrent.length;

    // 2. Изчисляваме Нови Клиенти за ПРЕДИШНИЯ период
    const newClientEmailsPrevious = firstAppointmentDates
      .filter(
        (client) =>
          client.firstAppointmentDate >= previousStartDate &&
          client.firstAppointmentDate <= previousEndDate
      )
      .map((c) => c._id);
    const previousNewClientsAcquired = newClientEmailsPrevious.length;

    // **II. Returning Clients & Retention Rate (Базирани на ПРЕДИШНИЯ еквивалентен период)**

    // 1. Уникални имейли (клиенти) в ТЕКУЩИЯ период
    const uniqueClientEmailsInCurrentPeriod = new Set(
      appointmentsInPeriod.map((a) => a.clientEmail).filter((e) => e)
    );

    // 2. Клиенти, които са имали среща в ПРЕДИШНИЯ период (Това са "Клиенти в началото на периода S")
    const previousClientEmails = [
      ...new Set(
        previousKPIs.appointments.map((a) => a.clientEmail).filter((e) => e)
      ),
    ];
    const totalPreviousClients = previousClientEmails.length; // S

    // 3. Завърнали се Клиенти: Клиенти от предишния период, които имат среща и в текущия
    const returningClientsCount = previousClientEmails.filter((email) =>
      uniqueClientEmailsInCurrentPeriod.has(email)
    ).length; // E - N (където N са новите)

    // 4. Retention Rate: (Завърнали се / Общо предишни) * 100
    const clientRetentionRate =
      totalPreviousClients > 0
        ? (returningClientsCount / totalPreviousClients) * 100
        : 0;

    // 5. Total Unique Clients in Current Period (за графиката Client Types)
    const totalUniqueClientsInCurrentPeriod =
      uniqueClientEmailsInCurrentPeriod.size;
    const returningClientsForChart =
      totalUniqueClientsInCurrentPeriod - newClientsAcquired;

    // ----------------------------------------------------
    // --- ИЗЧИСЛЯВАНЕ НА "CHANGE" МЕТРИКИТЕ
    // ----------------------------------------------------

    const totalAppointmentsChange = calculateChange(
      currentKPIs.totalAppointments,
      previousKPIs.totalAppointments
    );
    const totalRevenueChange = calculateChange(
      currentKPIs.totalRevenue,
      previousKPIs.totalRevenue
    );
    const completedAppointmentsChange = calculateChange(
      currentKPIs.completedAppointments,
      previousKPIs.completedAppointments
    );
    const cancelledAppointmentsChange = calculateChange(
      currentKPIs.cancelledAppointments,
      previousKPIs.cancelledAppointments
    );
    const averageServicePriceChange = calculateChange(
      currentKPIs.averageServicePrice,
      previousKPIs.averageServicePrice
    );
    const newClientsAcquiredChange = calculateChange(
      newClientsAcquired,
      previousNewClientsAcquired
    );

    // 3. Финален KPIData обект (включва промените)
    const KPIData = {
      totalAppointments: currentKPIs.totalAppointments,
      totalRevenue: parseFloat(currentKPIs.totalRevenue.toFixed(2)),
      completedAppointments: currentKPIs.completedAppointments,
      cancelledAppointments: currentKPIs.cancelledAppointments,
      averageServicePrice: parseFloat(
        currentKPIs.averageServicePrice.toFixed(2)
      ),
      clientRetentionRate: parseFloat(clientRetentionRate.toFixed(2)),
      newClientsAcquired,

      changes: {
        totalAppointments: totalAppointmentsChange,
        totalRevenue: totalRevenueChange,
        completedAppointments: completedAppointmentsChange,
        cancelledAppointments: cancelledAppointmentsChange,
        averageServicePrice: averageServicePriceChange,
        newClientsAcquired: newClientsAcquiredChange,
        // Client Retention Rate не се сравнява с предишен период по принцип
      },
    };

    // --- Изчисления за Графики (използвайки appointmentsInPeriod) ---

    // Графика: Appointments Over Time
    const appointmentsOverTime = await Appointment.aggregate([
      { $match: currentPeriodFilter },
      {
        $group: {
          _id: { $dayOfWeek: "$appointmentTime.start" },
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Графика: Revenue Over Time
    const revenueOverTime = await Appointment.aggregate([
      { $match: { ...currentPeriodFilter, status: "completed" } },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$appointmentTime.start" },
          },
          value: { $sum: "$serviceDetails.price" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Графика: Service Popularity
    const servicePopularity = await Appointment.aggregate([
      { $match: currentPeriodFilter },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: "$service",
          name: { $first: "$serviceDetails.name" },
          value: { $sum: 1 },
        },
      },
      { $sort: { value: -1 } },
      { $limit: 5 },
    ]);

    // Графика: Appointment Status Distribution
    const appointmentStatus = [
      { name: "Completed", value: currentKPIs.completedAppointments },
      { name: "Cancelled", value: currentKPIs.cancelledAppointments },
    ];

    // Графика: Client Types (Нови vs Завърнали се)
    const clientTypes = [
      { name: "Returning Clients", value: returningClientsForChart },
      { name: "New Clients", value: newClientsAcquired },
    ];

    // Графика: Revenue by Service Category
    const revenueByService = await Appointment.aggregate([
      { $match: { ...currentPeriodFilter, status: "completed" } },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: "$service",
          name: { $first: "$serviceDetails.name" },
          value: { $sum: "$serviceDetails.price" },
        },
      },
      { $sort: { value: -1 } },
    ]);

    // Връщаме всички данни
    return res.json({
      kpiData: KPIData,
      appointmentsOverTime: appointmentsOverTime.map((item) => ({
        name: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][item._id - 1],
        total: item.total,
        completed: item.completed,
        cancelled: item.cancelled,
      })),
      revenueOverTime: revenueOverTime.map((item) => ({
        name: item._id,
        value: item.value,
      })),
      servicePopularity: servicePopularity.map((item) => ({
        name: item.name,
        value: item.value,
      })),
      clientTypes,
      appointmentStatus,
      revenueByService: revenueByService.map((item) => ({
        name: item.name,
        value: item.value,
      })),
      periodInfo: {
        startDate,
        endDate,
        previousStartDate,
        previousEndDate,
        period: period || "last30days",
      },
    });
  } catch (error) {
    console.error("Error fetching performance data:", error);
    res.status(500).json({
      message: "Error fetching performance data",
      error: error.message,
    });
  }
};
