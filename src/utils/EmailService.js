// utils/EmailService.js

import nodemailer from "nodemailer";
import moment from "moment";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "appointmentappdi@gmail.com", // Твоят имейл адрес
    pass: "gmaa swqn jvqh dudf", // Парола на приложението, генерирана от Google
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

export const inviteStaffEmail = async (
  firstName,
  lastName,
  email,
  tempPassword,
  businessName
) => {
  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: email,
    subject: "Покана за присъединяване към екипа!",
    html: `
        <p>Здравейте, ${firstName} ${lastName},</p>
        <p>Вие бяхте поканен да се присъедините към екипа на ${businessName}.</p>
        <p>Ето вашите данни за вход:</p>
        <ul>
          <li><strong>Имейл:</strong> ${email}</li>
          <li><strong>Временна парола:</strong> ${tempPassword}</li>
        </ul>
        <p>Моля, влезте в акаунта си и сменете паролата при първа възможност.</p>
        <p>Поздрави,<br>${businessName}</p>
      `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Confirmation email sent successfully.");
  } catch (error) {
    console.error("Failed to send confirmation email:", error);
  }
};
