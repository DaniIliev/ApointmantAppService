import Location from "../models/Location.js";
import Business from "../models/Business.js";

export const createLocation = async (req, res, next) => {
  try {
    const { name, address, addressLine2, postalCode, city, country, phone, email } = req.body;
    console.log('req.user', req.user)
    const business = await Business.findOne({ owner: req.user.id });
    if (!business) {
      return res.status(404).json({ message: "Бизнес не е намерен" });
    }

    const location = await Location.create({
      businessId: business._id,
      name,
      address,
      addressLine2,
      postalCode,
      city,
      country,
      phone,
      email,
    });

    res.status(201).json(location);
  } catch (error) {
    next(error);
  }
};

export const getLocations = async (req, res, next) => {
  try {
    const { businessId } = req.query;
    const filter = businessId ? { businessId } : {};
    const locations = await Location.find(filter).lean();
    res.json(locations);
  } catch (error) {
    next(error);
  }
};

export const getLocationById = async (req, res, next) => {
  try {
    const location = await Location.findById(req.params.id).lean();
    if (!location) {
      return res.status(404).json({ message: "Локацията не е намерена" });
    }
    res.json(location);
  } catch (error) {
    next(error);
  }
};

export const updateLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Verify ownership
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ message: "Локацията не е намерена" });
    }

    const business = await Business.findOne({ _id: location.businessId, owner: req.user.id });
    if (!business) {
      return res.status(403).json({ message: "Нямате права за тази локация" });
    }

    const updatedLocation = await Location.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();

    res.json(updatedLocation);
  } catch (error) {
    next(error);
  }
};

export const deleteLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ message: "Локацията не е намерена" });
    }

    const business = await Business.findOne({ _id: location.businessId, owner: req.user.id });
    if (!business) {
      return res.status(403).json({ message: "Нямате права за тази локация" });
    }

    await Location.findByIdAndDelete(id);
    res.json({ message: "Локацията е изтрита успешно" });
  } catch (error) {
    next(error);
  }
};
