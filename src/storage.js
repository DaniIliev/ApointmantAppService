import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import cloudinary from "./cloudinaryConfig.js";

// const storage = new CloudinaryStorage({
//   cloudinary,
//   params: {
//     folder: "appointments",
//     allowed_formats: ["jpg", "png", "jpeg"],
//   },
// });
const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: "appointment-app-services",
    format: async (req, file) => "png",
    public_id: (req, file) => file.fieldname + "-" + Date.now(),
  },
});
const upload = multer({ storage });
export default upload;
