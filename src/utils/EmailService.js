import nodemailer from "nodemailer";
import moment from "moment";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getBaseTemplate, parseTemplate } from "./EmailTemplate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
  service: "gmail",
  pool: true,
  maxConnections: 2,
  maxMessages: 20,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
  auth: {
    user: "appointmentappdi@gmail.com",
    pass: "gmaa swqn jvqh dudf",
  },
});

// Load translations
const loadTranslations = (lang) => {
  try {
    const filePath = path.join(__dirname, `../locales/emails/${lang}.json`);
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load translations for ${lang}, falling back to bg:`, error);
    const bgPath = path.join(__dirname, "../locales/emails/bg.json");
    return JSON.parse(fs.readFileSync(bgPath, "utf8"));
  }
};

const sendInBackground = (mailOptions, successMsg, errorPrefix) => {
  setImmediate(() => {
    transporter
      .sendMail(mailOptions)
      .then(() => {
        console.log(successMsg);
      })
      .catch((error) => {
        console.error(errorPrefix, error);
      });
  });
};

export const sendConfirmationEmail = async (
  to,
  clientName,
  serviceName,
  startTime,
  endTime,
  businessName,
  dashboardLink,
  tempPassword = null,
  appointmentId = null,
  language = "bg",
) => {
  const t = loadTranslations(language);
  const formattedStartTime = moment(startTime).format("HH:mm");
  const formattedEndTime = moment(endTime).format("HH:mm");
  const formattedDate = moment(startTime).format("DD.MM.YYYY");
  const cancelLink = appointmentId
    ? `${dashboardLink}/appointments/${appointmentId}/cancel`
    : null;

  let content = `
    <h2>${t.common.hello}, ${clientName}!</h2>
    <p>${parseTemplate(t.confirmation.message, { businessName })}</p>
    
    <div class="info-card">
      <h3>${t.common.details_title}:</h3>
      <ul class="info-list">
        <li><strong>${t.common.service}:</strong> ${serviceName}</li>
        <li><strong>${t.common.date}:</strong> ${formattedDate}</li>
        <li><strong>${t.common.time}:</strong> ${formattedStartTime} - ${formattedEndTime}</li>
        <li><strong>${t.common.business}:</strong> ${businessName}</li>
      </ul>
    </div>
  `;

  if (tempPassword) {
    content += `
      <div class="highlight-box">
        <h3>${t.common.login_credentials}:</h3>
        <ul class="info-list">
          <li><strong>${t.common.email}:</strong> ${to}</li>
          <li><strong>${t.common.temp_password}:</strong> <code style="background-color: #fff; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></li>
        </ul>
        <p style="font-size: 12px; margin-top: 10px;">${t.common.change_password_hint}</p>
      </div>
    `;
  }

  content += `
    <p>
      <a href="${dashboardLink}" class="button">${t.common.view_profile}</a>
    </p>
  `;

  if (cancelLink) {
    content += `
      <p style="margin-top: 10px;">
        <a href="${cancelLink}" style="color: #d32f2f; font-size: 14px; text-decoration: underline;">${t.common.cancel_appointment}</a>
      </p>
    `;
  }

  content += `
    <p style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; font-size: 14px;">
      ${t.common.respectfully},<br/>
      ${t.common.team} ${businessName}
    </p>
  `;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: to,
    subject: parseTemplate(t.confirmation.subject, { serviceName, businessName }),
    html: getBaseTemplate(content, businessName),
  };

  sendInBackground(mailOptions, "Confirmation email sent.", "Failed confirmation email:");
};

// Wrapper for backward compatibility with new user confirmation
export const sendAppointmentConfirmationToNewUser = async (
  to,
  clientName,
  email,
  tempPassword,
  serviceName,
  startTime,
  endTime,
  businessName,
  dashboardLink,
  language = "bg",
) => {
  return sendConfirmationEmail(
    to,
    clientName,
    serviceName,
    startTime,
    endTime,
    businessName,
    dashboardLink,
    tempPassword,
    null,
    language,
  );
};

// Wrapper for backward compatibility with existing user confirmation
export const sendAppointmentConfirmationToExistingUser = async (
  to,
  clientName,
  serviceName,
  startTime,
  endTime,
  businessName,
  dashboardLink,
  appointmentId,
  language = "bg",
) => {
  return sendConfirmationEmail(
    to,
    clientName,
    serviceName,
    startTime,
    endTime,
    businessName,
    dashboardLink,
    null,
    appointmentId,
    language,
  );
};

export const inviteStaffEmail = async (
  firstName,
  lastName,
  email,
  tempPassword,
  businessName,
  language = "bg",
) => {
  const t = loadTranslations(language);
  
  let content = `
    <h2>${t.common.hello}, ${firstName} ${lastName}!</h2>
    <p>${parseTemplate(t.invitation.message, { businessName })}</p>
    
    <div class="highlight-box">
      <h3>${t.common.login_credentials}:</h3>
      <ul class="info-list">
        <li><strong>${t.common.email}:</strong> ${email}</li>
        <li><strong>${t.common.temp_password}:</strong> <code>${tempPassword}</code></li>
      </ul>
      <p style="font-size: 12px; margin-top: 10px;">${t.common.change_password_hint}</p>
    </div>
    
    <p>${t.common.respectfully},<br>${businessName}</p>
  `;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: email,
    subject: t.invitation.subject,
    html: getBaseTemplate(content, businessName),
  };

  sendInBackground(mailOptions, "Invitation email sent.", "Failed invitation email:");
};

export const sendForgotPasswordOtpEmail = async (email, firstName, otp, language = "bg") => {
  const t = loadTranslations(language);
  
  let content = `
    <h2>${t.common.hello}, ${firstName || t.common.user}!</h2>
    <p>${t.otp.message}</p>
    <div class="otp-code">${otp}</div>
    <p style="font-size: 14px; color: #666;">${t.otp.validity}</p>
    <p>${t.common.respectfully},<br/>${t.common.team} AppointDI®</p>
  `;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: email,
    subject: t.otp.subject,
    html: getBaseTemplate(content, "AppointDI"),
  };

  sendInBackground(mailOptions, "OTP email sent.", "Failed OTP email:");
};

export const sendAppointmentCancelledEmail = async (
  to,
  clientName,
  serviceName,
  startTime,
  endTime,
  businessName,
  dashboardLink,
  language = "bg",
) => {
  const t = loadTranslations(language);
  const formattedStartTime = moment(startTime).format("HH:mm");
  const formattedEndTime = moment(endTime).format("HH:mm");
  const formattedDate = moment(startTime).format("DD.MM.YYYY");

  let content = `
    <h2>${t.common.hello}, ${clientName}!</h2>
    <p>${t.cancellation.message}</p>
    
    <div class="info-card" style="border-left: 4px solid #ffc107;">
      <h3>${t.cancellation.cancelled_details}:</h3>
      <ul class="info-list">
        <li><strong>${t.common.service}:</strong> ${serviceName}</li>
        <li><strong>${t.common.date}:</strong> ${formattedDate}</li>
        <li><strong>${t.common.time}:</strong> ${formattedStartTime} - ${formattedEndTime}</li>
        <li><strong>${t.common.business}:</strong> ${businessName}</li>
      </ul>
    </div>

    <p>${t.cancellation.book_new}</p>
    <p><a href="${dashboardLink}" class="button">${t.common.book_new_appointment}</a></p>
    
    <p style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
      ${t.common.respectfully},<br/>
      ${t.common.team} ${businessName}
    </p>
  `;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: to,
    subject: parseTemplate(t.cancellation.subject, { businessName }),
    html: getBaseTemplate(content, businessName),
  };

  sendInBackground(mailOptions, "Cancellation email sent.", "Failed cancellation email:");
};

export const sendPlanExpirationWarning = async (
  to,
  firstName,
  lastName,
  planName,
  expirationDate,
  businessName,
  language = "bg",
) => {
  const t = loadTranslations(language);
  const formattedDate = moment(expirationDate).format("DD.MM.YYYY. HH:mm ч.");

  let content = `
    <h2>${t.common.hello}, ${firstName} ${lastName}!</h2>
    <p>${parseTemplate(t.subscription.expiration_warning.message, { planName, businessName })}</p>
    <div class="highlight-box">
      <p><strong>${t.subscription.expiration_warning.date_label}:</strong> ${formattedDate}</p>
    </div>
    <p style="font-size: 14px; color: #666;">${t.subscription.expiration_warning.hint}</p>
    
    <p style="margin-top: 20px;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard/subscription" class="button">
        ${t.subscription.expiration_warning.action_link_text}
      </a>
    </p>

    <p style="margin-top: 30px;">${t.common.respectfully},<br/>${t.common.team} AppointDI</p>
  `;


  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to: to,
    subject: parseTemplate(t.subscription.expiration_warning.subject, { planName }),
    html: getBaseTemplate(content, "AppointDI"),
  };

  sendInBackground(mailOptions, `Expiration warning email sent to ${to}`, `Failed expiration email:`);
};

export const sendEmailChangeNotification = async (
  oldEmail,
  newEmail,
  firstName,
  lastName,
  tempPassword,
  businessName,
  language = "bg",
) => {
  const t = loadTranslations(language);

  // Email to new address
  let newContent = `
    <h2>${t.common.hello}, ${firstName} ${lastName}!</h2>
    <p>${parseTemplate(t.staff.email_changed_new.message, { businessName })}</p>
    <div class="highlight-box">
      <h3>${t.staff.email_changed_new.credentials_title}:</h3>
      <ul class="info-list">
        <li><strong>${t.common.email}:</strong> ${newEmail}</li>
        <li><strong>${t.common.temp_password}:</strong> <code>${tempPassword}</code></li>
      </ul>
    </div>
    <p style="margin-top: 30px;">${t.common.respectfully},<br/>${t.common.team} ${businessName}</p>
  `;

  // Email to old address
  let oldContent = `
    <h2>${t.common.hello}, ${firstName} ${lastName}!</h2>
    <p>${parseTemplate(t.staff.email_changed_old.message, { businessName, newEmail })}</p>
    <p style="font-size: 14px; color: #666;">${parseTemplate(t.staff.email_changed_old.security_note, { oldEmail })}</p>
    <p style="margin-top: 30px;">${t.common.respectfully},<br/>${t.common.team} ${businessName}</p>
  `;

  const newMailOptions = {
    from: "appointmentappdi@gmail.com",
    to: newEmail,
    subject: t.staff.email_changed_new.subject,
    html: getBaseTemplate(newContent, businessName),
  };

  const oldMailOptions = {
    from: "appointmentappdi@gmail.com",
    to: oldEmail,
    subject: t.staff.email_changed_old.subject,
    html: getBaseTemplate(oldContent, businessName),
  };

  sendInBackground(newMailOptions, `Email change notification sent to ${newEmail}`, "Failed new email notification:");
  sendInBackground(oldMailOptions, `Email change notification sent to ${oldEmail}`, "Failed old email notification:");
};

export const sendPaymentAuthorizationEmail = (
  to,
  clientName,
  serviceName,
  businessName,
  amount,
  currency,
  language = "bg",
) => {
  const t = loadTranslations(language);
  const formattedAmount = (amount / 100).toFixed(2);
  
  let content = `
    <h2>${t.common.hello}, ${clientName}!</h2>
    <p>${parseTemplate(t.payment.authorized.message, { serviceName })}</p>
    <div class="highlight-box">
      <p>${parseTemplate(t.payment.authorized.details, { amount: formattedAmount, currency: currency.toUpperCase() })}</p>
    </div>
    <p style="font-size: 14px; color: #666;">${t.payment.authorized.hint}</p>
    <p style="margin-top: 30px;">${t.common.respectfully},<br/>${t.common.team} ${businessName}</p>
  `;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to,
    subject: parseTemplate(t.payment.authorized.subject, { serviceName }),
    html: getBaseTemplate(content, businessName),
  };

  sendInBackground(mailOptions, "Payment authorization email sent.", "Failed auth email:");
};

export const sendPaymentCapturedEmail = (
  to,
  clientName,
  serviceName,
  businessName,
  amount,
  currency,
  language = "bg",
) => {
  const t = loadTranslations(language);
  const formattedAmount = (amount / 100).toFixed(2);

  let content = `
    <h2>${t.common.hello}, ${clientName}!</h2>
    <p>${parseTemplate(t.payment.captured.message, { serviceName })}</p>
    <div class="info-card">
      <p><strong>${t.payment.captured.amount_label}:</strong> ${formattedAmount} ${currency.toUpperCase()}</p>
    </div>
    <p>${t.payment.captured.thanks}</p>
    <p style="margin-top: 30px;">${t.common.respectfully},<br/>${t.common.team} ${businessName}</p>
  `;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to,
    subject: parseTemplate(t.payment.captured.subject, { serviceName }),
    html: getBaseTemplate(content, businessName),
  };

  sendInBackground(mailOptions, "Payment captured email sent.", "Failed captured email:");
};

export const sendPaymentRefundedEmail = (
  to,
  clientName,
  serviceName,
  businessName,
  amount,
  currency,
  language = "bg",
) => {
  const t = loadTranslations(language);
  const formattedAmount = (amount / 100).toFixed(2);

  let content = `
    <h2>${t.common.hello}, ${clientName}!</h2>
    <p>${parseTemplate(t.payment.refunded.message, { serviceName })}</p>
    <div class="info-card">
      <p><strong>${t.payment.captured.amount_label}:</strong> ${formattedAmount} ${currency.toUpperCase()}</p>
    </div>
    <p style="font-size: 14px; color: #666;">${t.payment.refunded.hint}</p>
    <p style="margin-top: 30px;">${t.common.respectfully},<br/>${t.common.team} ${businessName}</p>
  `;

  const mailOptions = {
    from: "appointmentappdi@gmail.com",
    to,
    subject: parseTemplate(t.payment.refunded.subject, { serviceName }),
    html: getBaseTemplate(content, businessName),
  };

  sendInBackground(mailOptions, "Payment refunded email sent.", "Failed refund email:");
};
