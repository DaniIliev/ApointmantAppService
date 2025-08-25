import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Business from "../models/Business.js";
import { generateQrDataUrl } from "../utils/qrcode.js";
export const register = async (req, res, next) => {
  try {
    const { email, password, role, phone } = req.body;
    if (!email || !password || !role)
      return res
        .status(400)
        .json({ message: "email, password, role са задължителни" });
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ message: "Email вече съществува" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, role, phone });
    let business;
    if (role == "business") {
      const { name, address, phone } = req.body;
      if (!name)
        return res.status(400).json({ message: "name е задължително" });

      business = await Business.create({
        owner: user.id,
        name,
        address,
        phone,
      });

      const link = `${process.env.CLIENT_URL}/book/68acc34db102950dab12a9a1`;
      const qrCodeUrl = await generateQrDataUrl(link);
      business.qrCodeUrl = qrCodeUrl;
      await business.save();
    }
    let result = {
      id: user._id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
    if (business) {
      result = {
        ...result,
        ...business,
      };
    }
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (e) {
    next(e);
  }
};

// export const test = async (req, res, next) => {
//   try {
//     const link = `${process.env.CLIENT_URL}/book/68acc34db102950dab12a9a1`;
//     const qrCodeUrl = await generateQrDataUrl(link);
//     console.log("qrCodeUrl", qrCodeUrl);
//     res.json({
//       qrCodeUrl,
//     });
//   } catch (e) {
//     next(e);
//   }
// };
