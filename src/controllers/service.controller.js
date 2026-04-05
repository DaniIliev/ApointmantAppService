import Service from "../models/Service.js";
import Business from "../models/Business.js";

export const createService = async (req, res, next) => {
  try {
    // Извличаме полетата от тялото на заявката
    const {
      name,
      description,
      duration,
      price,
      color,
      staffMembers,
      category,
      paymentOption,
      locationId,
      isGroup,
      capacity,
    } = req.body;
    const imageUrl = req.file ? req.file.path : req.body.imageUrl;
    let parsedStaffIds = staffMembers;
    if (staffMembers && typeof staffMembers === "string") {
      try {
        parsedStaffIds = JSON.parse(staffMembers);
      } catch (error) {
        parsedStaffIds = [];
      }
    }
    if (!Array.isArray(parsedStaffIds)) {
      if (typeof parsedStaffIds === "string" && parsedStaffIds.length === 24) {
        parsedStaffIds = [parsedStaffIds];
      } else {
        parsedStaffIds = [];
      }
    }

    // Ensure we only have IDs (if objects like {_id: ...} were sent)
    parsedStaffIds = parsedStaffIds
      .map((item) => (typeof item === "object" ? item._id : item))
      .filter(Boolean);

    let businessId = req.user.businessId;

    if (!businessId) {
      const ownedBusiness = await Business.findOne({ owner: req.user.id });
      if (ownedBusiness) {
        businessId = ownedBusiness._id;
      }
    }

    if (!businessId) {
      return res.status(404).json({ message: "Бизнесът не е намерен." });
    }

    const service = await Service.create({
      business: businessId,
      name: name?.trim(),
      description,
      duration,
      category,
      price,
      color,
      imageUrl,
      staffMembers: parsedStaffIds,
      paymentOption: paymentOption || "cash",
      locationId,
      isGroup: isGroup === "true" || isGroup === true,
      capacity: Number(capacity) || 1,
    });

    res.status(201).json(service);
  } catch (e) {
    next(e);
  }
};

export const listServices = async (req, res, next) => {
  try {
    const { businessId, locationId } = req.query;
    const headerLocationId = req.headers["x-location-id"];
    const effectiveLocationId = locationId || headerLocationId;
    console.log("locationId", locationId);
    console.log("headerLocationId", headerLocationId);
    console.log("effectiveLocationId", effectiveLocationId);
    const filter = { business: businessId };
    if (effectiveLocationId) filter.locationId = effectiveLocationId;
    const services = await Service.find(filter).populate("staffMembers").lean();
    res.json(services);
  } catch (e) {
    next(e);
  }
};

export const updateService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const {
      name,
      description,
      duration,
      price,
      color,
      category,
      staffMembers,
      paymentOption,
      locationId,
      isGroup,
      capacity,
    } = req.body;
    const imageUrl = req.file?.path || req.body.imageUrl;
    const serviceToUpdate = await Service.findById(serviceId);
    if (!serviceToUpdate) {
      return res.status(404).json({ message: "Услугата не е намерена." });
    }

    // Намираме бизнеса по businessId на потребителя
    const business = await Business.findById(req.user.businessId);
    if (
      !business ||
      String(business._id) !== String(serviceToUpdate.business)
    ) {
      return res
        .status(403)
        .json({ message: "Нямате права да редактирате тази услуга." });
    }

    serviceToUpdate.name = name ? name.trim() : serviceToUpdate.name;
    serviceToUpdate.description = description || serviceToUpdate.description;
    serviceToUpdate.duration = duration || serviceToUpdate.duration;
    serviceToUpdate.price = price || serviceToUpdate.price;
    serviceToUpdate.color = color || serviceToUpdate.color;
    serviceToUpdate.category = category || serviceToUpdate.category;
    serviceToUpdate.paymentOption =
      paymentOption || serviceToUpdate.paymentOption;

    if (isGroup !== undefined) {
      serviceToUpdate.isGroup = isGroup === "true" || isGroup === true;
    }
    if (capacity !== undefined) {
      serviceToUpdate.capacity = Number(capacity) || 1;
    }
    if (locationId !== undefined) {
      serviceToUpdate.locationId = locationId || null;
    }

    if (staffMembers) {
      let parsedStaffIds = staffMembers;
      if (typeof staffMembers === "string") {
        try {
          parsedStaffIds = JSON.parse(staffMembers);
        } catch (error) {
          parsedStaffIds = [];
        }
      }
      if (!Array.isArray(parsedStaffIds)) {
        if (
          typeof parsedStaffIds === "string" &&
          parsedStaffIds.length === 24
        ) {
          parsedStaffIds = [parsedStaffIds];
        } else {
          parsedStaffIds = [];
        }
      }
      // Ensure we only have IDs (if objects like {_id: ...} were sent)
      serviceToUpdate.staffMembers = parsedStaffIds
        .map((item) => (typeof item === "object" ? item._id : item))
        .filter(Boolean);
    }

    if (imageUrl !== undefined) {
      serviceToUpdate.imageUrl = imageUrl;
    }

    await serviceToUpdate.save();

    res.json(serviceToUpdate);
  } catch (e) {
    next(e);
  }
};

export const deleteService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;

    const serviceToDelete = await Service.findById(serviceId);
    if (!serviceToDelete) {
      return res.status(404).json({ message: "Услугата не е намерена." });
    }
    // Намираме бизнеса по businessId на потребителя
    const business = await Business.findById(req.user.businessId);
    if (
      !business ||
      String(business._id) !== String(serviceToDelete.business)
    ) {
      return res
        .status(403)
        .json({ message: "Нямате права да изтривате тази услуга." });
    }
    await Service.deleteOne({ _id: serviceId });

    res.json({ message: "Услугата беше успешно изтрита." });
  } catch (e) {
    next(e);
  }
};

export const assignStaffToService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { staffIds } = req.body; // Очакваме масив от ID-та на служители

    const serviceToUpdate =
      await Service.findById(serviceId).populate("business");
    if (!serviceToUpdate) {
      return res.status(404).json({ message: "Услугата не е намерена." });
    }

    // Проверяваме дали businessId на услугата съвпада с businessId на потребителя
    if (String(serviceToUpdate.business._id) !== req.user.businessId) {
      return res
        .status(403)
        .json({ message: "Нямате права да редактирате тази услуга." });
    }

    // Проверка дали всички staffIds са валидни служители на този бизнес
    const businessStaff = await User.find({
      businessId: req.user.businessId,
      role: "staff",
    });
    const businessStaffIds = businessStaff.map((staff) => String(staff._id));

    const areAllStaffValid = staffIds.every((id) =>
      businessStaffIds.includes(id),
    );

    if (!areAllStaffValid) {
      return res.status(400).json({
        message:
          "Едно или повече ID-та на служители са невалидни за този бизнес.",
      });
    }

    serviceToUpdate.staffMembers = staffIds;
    await serviceToUpdate.save();

    res.json(serviceToUpdate);
  } catch (e) {
    next(e);
  }
};

export const listStaffForService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;

    const service = await Service.findById(serviceId).populate({
      path: "staffMembers",
      select: "firstName lastName",
    });

    if (!service) {
      return res.status(404).json({ message: "Услугата не е намерена." });
    }

    res.json(service.staffMembers);
  } catch (e) {
    next(e);
  }
};
