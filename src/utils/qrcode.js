import QRCode from "qrcode";

export const generateQrDataUrl = async (text) => {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 6,
  });
};
