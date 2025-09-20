// utils/EmailService.js

import nodemailer from "nodemailer";
import moment from "moment";

const transporter = nodemailer.createTransport({
  service: "Gmail", // Може да се промени на SendGrid или друг
  auth: {
    user: "вашият-имейл@gmail.com",
    pass: "вашата-парола-за-приложение", // Използвайте парола за приложение
  },
});

export const sendConfirmationEmail = async (
  to,
  clientName,
  serviceName,
  startTime,
  endTime,
  businessName
) => {
  const formattedStartTime = moment(startTime).format("HH:mm");
  const formattedEndTime = moment(endTime).format("HH:mm");
  const formattedDate = moment(startTime).format("DD.MM.YYYY");

  const mailOptions = {
    from: '"Your Business Name" <вашият-имейл@gmail.com>',
    to: to,
    subject: `Потвърждение на записан час: ${serviceName} с ${businessName}`,
    html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Здравейте, ${clientName}!</h2>
                <p>Вашият час за услугата <strong>${serviceName}</strong> с <strong>${businessName}</strong> е успешно потвърден.</p>
                <p><strong>Детайли на срещата:</strong></p>
                <ul>
                    <li><strong>Дата:</strong> ${formattedDate}</li>
                    <li><strong>Време:</strong> ${formattedStartTime} - ${formattedEndTime}</li>
                    <li><strong>Услуга:</strong> ${serviceName}</li>
                </ul>
                <p>Очакваме Ви!</p>
                <p>С уважение,<br/>Екипът на ${businessName}</p>
            </div>
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Confirmation email sent successfully.");
  } catch (error) {
    console.error("Failed to send confirmation email:", error);
  }
};
