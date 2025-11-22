import Service from "../models/Service.js";
import Business from "../models/Business.js";

export const createService = async (req, res, next) => {
  try {
    // Извличаме полетата от тялото на заявката
    const { name, description, duration, price, color, staffs, category } =
      req.body;
    const imageUrl = req.file ? req.file.path : undefined;
    let parsedStaffs = staffs;
    if (staffs && typeof staffs === "string") {
      try {
        parsedStaffs = JSON.parse(staffs);
      } catch (error) {
        parsedStaffs = [];
      }
    }
    if (!Array.isArray(parsedStaffs)) {
      if (typeof parsedStaffs === "string" && parsedStaffs.length === 24) {
        parsedStaffs = [{ _id: parsedStaffs }];
      } else {
        parsedStaffs = [];
      }
    }

    const business = await Business.findById(req.user.businessId);
    if (!business) {
      return res.status(404).json({ message: "Бизнесът не е намерен." });
    }
    const service = await Service.create({
      business: business._id,
      name: name?.trim(),
      description,
      duration,
      category,
      price,
      color,
      imageUrl,
      staffs: parsedStaffs,
    });

    res.status(201).json(service);
  } catch (e) {
    next(e);
  }
};

export const listServices = async (req, res, next) => {
  try {
    const { businessId } = req.query;
    const services = await Service.find({ business: businessId }).lean();
    res.json(services);
  } catch (e) {
    next(e);
  }
};

export const updateService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { name, description, duration, price, color, category } = req.body;
    const imageUrl = req.file?.path;
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

    if (imageUrl) {
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

    const serviceToUpdate = await Service.findById(serviceId).populate(
      "business"
    );
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
      businessStaffIds.includes(id)
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
// import Service from "../models/Service.js";
// import Business from "../models/Business.js";

// export const createService = async (req, res, next) => {
//   try {
//     console.log(req.body);
//     const { name, description, duration, price, color, staffIds } = req.body;
//     const imageUrl = req.file ? req.file.path : undefined;

//     const business = await Business.findOne({ owner: req.user.id });
//     if (!business) {
//       return res.status(404).json({ message: "Бизнесът не е намерен." });
//     }

//     const service = await Service.create({
//       business: business._id,
//       name,
//       description,
//       duration,
//       price,
//       color,
//       imageUrl,
//       staffIds,
//     });

//     res.status(201).json(service);
//   } catch (e) {
//     next(e);
//   }
// };

// export const listServices = async (req, res, next) => {
//   try {
//     const business = await Business.findOne({ owner: req.user.id });
//     if (!business) {
//       return res.status(404).json({ message: "Бизнесът не е намерен." });
//     }

//     const services = await Service.find({ business: business._id }).lean();
//     res.json(services);
//   } catch (e) {
//     next(e);
//   }
// };

// export const updateService = async (req, res, next) => {
//   try {
//     const { serviceId } = req.params;
//     const { name, description, duration, price, color } = req.body;
//     const imageUrl = req.file?.path;
//     const serviceToUpdate = await Service.findById(serviceId);
//     if (!serviceToUpdate) {
//       return res.status(404).json({ message: "Услугата не е намерена." });
//     }

//     const business = await Business.findOne({ owner: req.user.id });
//     if (
//       !business ||
//       String(business._id) !== String(serviceToUpdate.business)
//     ) {
//       return res
//         .status(403)
//         .json({ message: "Нямате права да редактирате тази услуга." });
//     }

//     serviceToUpdate.name = name || serviceToUpdate.name;
//     serviceToUpdate.description = description || serviceToUpdate.description;
//     serviceToUpdate.duration = duration || serviceToUpdate.duration;
//     serviceToUpdate.price = price || serviceToUpdate.price;
//     serviceToUpdate.color = color || serviceToUpdate.color;

//     if (imageUrl) {
//       serviceToUpdate.imageUrl = imageUrl;
//     }

//     await serviceToUpdate.save();

//     res.json(serviceToUpdate);
//   } catch (e) {
//     next(e);
//   }
// };
// export const deleteService = async (req, res, next) => {
//   try {
//     const { serviceId } = req.params;

//     const serviceToDelete = await Service.findById(serviceId);
//     if (!serviceToDelete) {
//       return res.status(404).json({ message: "Услугата не е намерена." });
//     }
//     const business = await Business.findOne({ owner: req.user.id });
//     if (
//       !business ||
//       String(business._id) !== String(serviceToDelete.business)
//     ) {
//       return res
//         .status(403)
//         .json({ message: "Нямате права да изтривате тази услуга." });
//     }
//     await Service.deleteOne({ _id: serviceId });

//     res.json({ message: "Услугата беше успешно изтрита." });
//   } catch (e) {
//     next(e);
//   }
// };

// export const assignStaffToService = async (req, res, next) => {
//   try {
//     const { serviceId } = req.params;
//     const { staffIds } = req.body; // Очакваме масив от ID-та на служители

//     const serviceToUpdate = await Service.findById(serviceId).populate(
//       "business"
//     );
//     if (!serviceToUpdate) {
//       return res.status(404).json({ message: "Услугата не е намерена." });
//     }

//     if (String(serviceToUpdate.business.owner) !== req.user.id) {
//       return res
//         .status(403)
//         .json({ message: "Нямате права да редактирате тази услуга." });
//     }

//     // Проверка дали всички staffIds са валидни служители на този бизнес
//     const businessStaff = await User.find({
//       businessId: serviceToUpdate.business._id,
//       role: "staff",
//     });
//     const businessStaffIds = businessStaff.map((staff) => String(staff._id));

//     const areAllStaffValid = staffIds.every((id) =>
//       businessStaffIds.includes(id)
//     );

//     if (!areAllStaffValid) {
//       return res.status(400).json({
//         message:
//           "Едно или повече ID-та на служители са невалидни за този бизнес.",
//       });
//     }

//     serviceToUpdate.staffMembers = staffIds;
//     await serviceToUpdate.save();

//     res.json(serviceToUpdate);
//   } catch (e) {
//     next(e);
//   }
// };

// export const listStaffForService = async (req, res, next) => {
//   try {
//     const { serviceId } = req.params;

//     const service = await Service.findById(serviceId).populate({
//       path: "staffMembers",
//       select: "firstName lastName",
//     });

//     if (!service) {
//       return res.status(404).json({ message: "Услугата не е намерена." });
//     }

//     res.json(service.staffMembers);
//   } catch (e) {
//     next(e);
//   }
// };
