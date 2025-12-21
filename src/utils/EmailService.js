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
  businessName,
  dashboardLink,
  tempPassword = null,
  appointmentId = null
) => {
  const formattedStartTime = moment(startTime).format("HH:mm");
  const formattedEndTime = moment(endTime).format("HH:mm");
  const formattedDate = moment(startTime).format("DD.MM.YYYY");
  const cancelLink = appointmentId
    ? `${dashboardLink}/appointments/${appointmentId}/cancel`
    : null;

  let html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2>Здравейте, ${clientName}!</h2>
      <p>Вашият час е успешно потвърден с <strong>${businessName}</strong>.</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3>Детайли на вашия записан час:</h3>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Услуга:</strong> ${serviceName}</li>
          <li><strong>Дата:</strong> ${formattedDate}</li>
          <li><strong>Време:</strong> ${formattedStartTime} - ${formattedEndTime}</li>
          <li><strong>Бизнес:</strong> ${businessName}</li>
        </ul>
      </div>
  `;

  // If tempPassword is provided, show login credentials (new user)
  if (tempPassword) {
    html += `
      <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3>Ваши данни за вход:</h3>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Имейл:</strong> ${to}</li>
          <li><strong>Временна парола:</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 4px; font-family: monospace;">${tempPassword}</code></li>
        </ul>
        <p style="font-size: 12px; color: #666;">Моля, сменете паролата при първа възможност след влизане.</p>
      </div>
    `;
  }

  html += `
      <p>
        <a href="${dashboardLink}" style="background-color: #3b61c0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Вижте вашия профил
        </a>
      </p>
  `;

  // Add cancel button if appointmentId is provided
  if (cancelLink) {
    html += `
      <p>
        <a href="${cancelLink}" style="background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Отказ от час
        </a>
      </p>
    `;
  }

  html += `
      <p style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
        Очакваме Ви!<br/>
        С уважение,<br/>
        Екипът на ${businessName}
      </p>
    </div>
  `;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: to,
    subject: `Потвърждение на записан час: ${serviceName} с ${businessName}`,
    html: html,
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

export const sendPlanExpirationWarning = async (
  to,
  firstName,
  lastName,
  planName,
  expirationDate,
  businessName
) => {
  const formattedDate = moment(expirationDate).format("DD.MM.YYYY");

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: to,
    subject: `Вашият план ${planName} изтича след 1 седмица`,
    html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Здравейте, ${firstName} ${lastName}!</h2>
            <p>Това е напомняне, че вашият план <strong>${planName}</strong> за бизнес <strong>${businessName}</strong> изтича след 1 седмица.</p>
            <p><strong>Дата на изтичане:</strong> ${formattedDate}</p>
            <p>За да продължите да използвате услугите без прекъсване, моля, обновете вашия абонамент преди тази дата.</p>
            <p>Ако имате въпроси или нужда от помощ, не се колебайте да се свържете с нас.</p>
            <p>С уважение,<br/>Екипът на AppointmentApp</p>
        </div>
      `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Expiration warning email sent to ${to}`);
  } catch (error) {
    console.error(`Failed to send expiration warning email to ${to}:`, error);
  }
};

export const sendForgotPasswordOtpEmail = async (email, firstName, otp) => {
  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: email,
    subject: "Вашият код за еднократен вход (AppointDI®)",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Здравейте, ${firstName || "потребител"}!</h2>
        <p>Използвайте следния код за еднократен достъп до вашия профил:</p>
        <div style="font-size: 2em; font-weight: bold; margin: 16px 0;">${otp}</div>
        <p>Кодът е валиден 10 минути. Ако не сте заявили този код, игнорирайте този имейл.</p>
        <p>С уважение,<br/>Екипът на AppointDI®</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Forgot password OTP email sent to ${email}`);
  } catch (error) {
    console.error(
      `Failed to send forgot password OTP email to ${email}:`,
      error
    );
  }
};
export const sendEmailChangeNotification = async (
  oldEmail,
  newEmail,
  firstName,
  lastName,
  tempPassword,
  businessName
) => {
  // Email to new address with new credentials
  const newEmailOptions = {
    from: "appointmentappdi@gmail.com",
    to: newEmail,
    subject: "Вашият имейл е променен - Нови данни за вход",
    html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Здравейте, ${firstName} ${lastName}!</h2>
            <p>Вашият имейл адрес в системата на <strong>${businessName}</strong> е променен.</p>
            <p><strong>Нови данни за вход:</strong></p>
            <ul>
              <li><strong>Имейл:</strong> ${newEmail}</li>
              <li><strong>Временна парола:</strong> ${tempPassword}</li>
            </ul>
            <p>Моля, влезте в акаунта си с новите данни и сменете паролата при първа възможност.</p>
            <p>С уважение,<br/>Екипът на ${businessName}</p>
        </div>
      `,
  };

  // Email to old address notifying about account deletion
  const oldEmailOptions = {
    from: "appointmentappdi@gmail.com",
    to: oldEmail,
    subject: "Вашият акаунт е деактивиран",
    html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Здравейте, ${firstName} ${lastName}!</h2>
            <p>Вашият имейл адрес в системата на <strong>${businessName}</strong> е променен на <strong>${newEmail}</strong>.</p>
            <p>Акаунтът, свързан с този имейл адрес (<strong>${oldEmail}</strong>), вече не е активен.</p>
            <p>Ако не сте извършили тази промяна, моля свържете се с вашия мениджър незабавно.</p>
            <p>С уважение,<br/>Екипът на ${businessName}</p>
        </div>
      `,
  };

  try {
    await transporter.sendMail(newEmailOptions);
    await transporter.sendMail(oldEmailOptions);
    console.log(
      `Email change notifications sent to ${oldEmail} and ${newEmail}`
    );
  } catch (error) {
    console.error("Failed to send email change notifications:", error);
  }
};

export const sendAppointmentConfirmationToNewUser = async (
  to,
  clientName,
  email,
  tempPassword,
  serviceName,
  startTime,
  endTime,
  businessName,
  dashboardLink
) => {
  const formattedStartTime = moment(startTime).format("HH:mm");
  const formattedEndTime = moment(endTime).format("HH:mm");
  const formattedDate = moment(startTime).format("DD.MM.YYYY");

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: to,
    subject: `Ваш записан час с ${businessName} - Данни за вход`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Здравейте, ${clientName}!</h2>
        <p>Вашият час е успешно записан с <strong>${businessName}</strong>.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>Детайли на вашия записан час:</h3>
          <ul style="list-style: none; padding: 0;">
            <li><strong>Услуга:</strong> ${serviceName}</li>
            <li><strong>Дата:</strong> ${formattedDate}</li>
            <li><strong>Време:</strong> ${formattedStartTime} - ${formattedEndTime}</li>
            <li><strong>Бизнес:</strong> ${businessName}</li>
          </ul>
        </div>

        <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>Ваши данни за вход:</h3>
          <ul style="list-style: none; padding: 0;">
            <li><strong>Имейл:</strong> ${email}</li>
            <li><strong>Временна парола:</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 4px; font-family: monospace;">${tempPassword}</code></li>
          </ul>
          <p style="font-size: 12px; color: #666;">Моля, сменете паролата при първа възможност след влизане.</p>
        </div>

        <p>
          <a href="${dashboardLink}" style="background-color: #3b61c0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Влезте в моя профил
          </a>
        </p>

        <p style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
          Очакваме Ви!<br/>
          С уважение,<br/>
          Екипът на ${businessName}
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Appointment confirmation email sent to ${to} (new user)`);
  } catch (error) {
    console.error(
      `Failed to send appointment confirmation email to ${to}:`,
      error
    );
  }
};

export const sendAppointmentConfirmationToExistingUser = async (
  to,
  clientName,
  serviceName,
  startTime,
  endTime,
  businessName,
  dashboardLink,
  appointmentId
) => {
  const formattedStartTime = moment(startTime).format("HH:mm");
  const formattedEndTime = moment(endTime).format("HH:mm");
  const formattedDate = moment(startTime).format("DD.MM.YYYY");
  const cancelLink = `${dashboardLink}/appointments/${appointmentId}/cancel`;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: to,
    subject: `Ваш записан час с ${businessName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Здравейте, ${clientName}!</h2>
        <p>Вашият час е успешно записан с <strong>${businessName}</strong>.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>Детайли на вашия записан час:</h3>
          <ul style="list-style: none; padding: 0;">
            <li><strong>Услуга:</strong> ${serviceName}</li>
            <li><strong>Дата:</strong> ${formattedDate}</li>
            <li><strong>Време:</strong> ${formattedStartTime} - ${formattedEndTime}</li>
            <li><strong>Бизнес:</strong> ${businessName}</li>
          </ul>
        </div>

        <p>
          <a href="${dashboardLink}" style="background-color: #3b61c0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Вижте вашия профил
          </a>
        </p>

        <p>
          <a href="${cancelLink}" style="background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Отказ от час
          </a>
        </p>

        <p style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
          Очакваме Ви!<br/>
          С уважение,<br/>
          Екипът на ${businessName}
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Appointment confirmation email sent to ${to} (existing user)`);
  } catch (error) {
    console.error(
      `Failed to send appointment confirmation email to ${to}:`,
      error
    );
  }
};

export const sendAppointmentCancelledEmail = async (
  to,
  clientName,
  serviceName,
  startTime,
  endTime,
  businessName,
  dashboardLink
) => {
  const formattedStartTime = moment(startTime).format("HH:mm");
  const formattedEndTime = moment(endTime).format("HH:mm");
  const formattedDate = moment(startTime).format("DD.MM.YYYY");

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: to,
    subject: `Отказ от час - ${businessName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Здравейте, ${clientName}!</h2>
        <p>Вашият час е отменен.</p>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107;">
          <h3>Отменен час:</h3>
          <ul style="list-style: none; padding: 0;">
            <li><strong>Услуга:</strong> ${serviceName}</li>
            <li><strong>Дата:</strong> ${formattedDate}</li>
            <li><strong>Време:</strong> ${formattedStartTime} - ${formattedEndTime}</li>
            <li><strong>Бизнес:</strong> ${businessName}</li>
          </ul>
        </div>

        <p>Ако желаете да запишете нов час, моля посетете нашия портал.</p>

        <p>
          <a href="${dashboardLink}" style="background-color: #3b61c0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Запишете нов час
          </a>
        </p>

        <p style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
          Благодарим Ви!<br/>
          С уважение,<br/>
          Екипът на ${businessName}
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Appointment cancellation confirmation email sent to ${to}`);
  } catch (error) {
    console.error(
      `Failed to send appointment cancellation email to ${to}:`,
      error
    );
  }
};
