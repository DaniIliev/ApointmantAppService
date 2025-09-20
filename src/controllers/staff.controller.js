import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Business from "../models/Business.js";
import nodemailer from "nodemailer";

export const listBusinessStaff = async (req, res, next) => {
  try {
    const business = await Business.findById(req.user.businessId);

    if (!business) {
      return res.status(404).json({ message: "Бизнесът не е намерен." });
    }
    const staffMembers = await User.find({
      businessId: business._id,
      role: { $in: ["business", "staff"] },
    }).select("firstName lastName email phone role _id");

    res.json(staffMembers);
  } catch (e) {
    next(e);
  }
};

export const inviteStaff = async (req, res, next) => {
  try {
    const { email, firstName, lastName, phone } = req.body;
    const ownerId = req.user.id; // Взимаме ID-то на собственика от `req.user` след middleware-а

    // 1. Проверка дали потребителят е собственик на бизнес
    const business = await Business.findOne({ owner: ownerId });
    if (!business) {
      return res.status(403).json({
        message: "Само собственици на бизнес могат да канят служители.",
      });
    }

    // 2. Проверка дали има съществуващ потребител с този имейл
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Потребител с този имейл вече съществува." });
    }

    // 3. Генериране на временна парола
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // 4. Създаване на нов потребител със роля 'staff'
    const newStaff = await User.create({
      email,
      passwordHash,
      firstName,
      lastName,
      phone,
      role: "staff",
      businessId: business._id,
    });

    // 5. Изпращане на имейл с временната парола
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "appointmentappdi@gmail.com", // Твоят имейл адрес
        pass: "gmaa swqn jvqh dudf", // Парола на приложението, генерирана от Google
      },
    });

    const mailOptions = {
      from: "appointmentappdi@gmail.com",
      to: email,
      subject: "Покана за присъединяване към екипа!",
      html: `
        <p>Здравейте, ${firstName} ${lastName},</p>
        <p>Вие бяхте поканен да се присъедините към екипа на ${business.name}.</p>
        <p>Ето вашите данни за вход:</p>
        <ul>
          <li><strong>Имейл:</strong> ${email}</li>
          <li><strong>Временна парола:</strong> ${tempPassword}</li>
        </ul>
        <p>Моля, влезте в акаунта си и сменете паролата при първа възможност.</p>
        <p>Поздрави,<br>${business.name}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({
      message:
        "Служителят е поканен успешно. Изпратен е имейл с временна парола.",
      staff: {
        _id: newStaff._id,
        email: newStaff.email,
        firstName: newStaff.firstName,
        lastName: newStaff.lastName,
        phone: newStaff.phone,
        role: newStaff.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffByIds = async (req, res, next) => {
  try {
    const { staffIds } = req.body;

    if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Невалиден списък със служители." });
    }

    const staff = await User.find({ _id: { $in: staffIds } }).select(
      "firstName lastName email role"
    );

    res.status(200).json(staff);
  } catch (e) {
    next(e);
  }
};

// // src/controllers/staff.controller.js

// import bcrypt from "bcryptjs";
// import User from "../models/User.js";
// import Business from "../models/Business.js";
// import nodemailer from "nodemailer";

// export const listBusinessStaff = async (req, res, next) => {
//   try {
//     const ownerId = req.user.id;
//     const business = await Business.findOne({ owner: ownerId });

//     if (!business) {
//       return res.status(404).json({ message: "Бизнесът не е намерен." });
//     }

//     // Променяме заявката, за да намерим всички потребители,
//     // чиято роля е "business" ИЛИ "staff", свързани с този бизнес.
//     const staffMembers = await User.find({
//       businessId: business._id,
//       role: { $in: ["business", "staff"] },
//     })
//       .select("firstName lastName _id")
//       .lean();

//     res.json(staffMembers);
//   } catch (e) {
//     next(e);
//   }
// };

// export const inviteStaff = async (req, res, next) => {
//   try {
//     const { email, firstName, lastName, phone } = req.body;
//     const ownerId = req.user.id; // Взимаме ID-то на собственика от `req.user` след middleware-а

//     // 1. Проверка дали потребителят е собственик на бизнес
//     const business = await Business.findOne({ owner: ownerId });
//     if (!business) {
//       return res.status(403).json({
//         message: "Само собственици на бизнес могат да канят служители.",
//       });
//     }

//     // 2. Проверка дали има съществуващ потребител с този имейл
//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       return res
//         .status(409)
//         .json({ message: "Потребител с този имейл вече съществува." });
//     }

//     // 3. Генериране на временна парола
//     const tempPassword = Math.random().toString(36).slice(-8);
//     const passwordHash = await bcrypt.hash(tempPassword, 10);

//     // 4. Създаване на нов потребител със роля 'staff'
//     const newStaff = await User.create({
//       email,
//       passwordHash,
//       firstName,
//       lastName,
//       phone,
//       role: "staff",
//       businessId: business._id,
//     });

//     // 5. Изпращане на имейл с временната парола
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: "appointmentappdi@gmail.com", // Твоят имейл адрес
//         pass: "YOUR_GMAIL_APP_PASSWORD", // Парола на приложението, генерирана от Google
//       },
//     });

//     const mailOptions = {
//       from: "appointmentappdi@gmail.com",
//       to: email,
//       subject: "Покана за присъединяване към екипа!",
//       html: `
//         <p>Здравейте, ${firstName} ${lastName},</p>
//         <p>Вие бяхте поканен да се присъедините към екипа на ${business.name}.</p>
//         <p>Ето вашите данни за вход:</p>
//         <ul>
//           <li><strong>Имейл:</strong> ${email}</li>
//           <li><strong>Временна парола:</strong> ${tempPassword}</li>
//         </ul>
//         <p>Моля, влезте в акаунта си и сменете паролата при първа възможност.</p>
//         <p>Поздрави,<br>${business.name}</p>
//       `,
//     };

//     await transporter.sendMail(mailOptions);

//     res.status(201).json({
//       message:
//         "Служителят е поканен успешно. Изпратен е имейл с временна парола.",
//       staff: {
//         id: newStaff._id,
//         email: newStaff.email,
//         role: newStaff.role,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };
