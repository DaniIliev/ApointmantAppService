/**
 * Premium Email Template Wrapper
 * Provides a consistent, professional look for all system emails.
 */

export const getBaseTemplate = (content, businessName = "AppointDI") => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #1a1a1a;
          margin: 0;
          padding: 0;
          background-color: #f9fafb;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .header {
          background-color: #3b61c0;
          padding: 32px 40px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.025em;
        }
        .content {
          padding: 40px;
        }
        .footer {
          padding: 32px 40px;
          background-color: #f3f4f6;
          text-align: center;
          font-size: 13px;
          color: #6b7280;
        }
        .button {
          display: inline-block;
          background-color: #3b61c0;
          color: #ffffff !important;
          padding: 12px 28px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          margin-top: 20px;
          transition: background-color 0.2s;
        }
        .info-card {
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 20px;
          margin: 24px 0;
        }
        .info-card h3 {
          margin-top: 0;
          font-size: 16px;
          color: #374151;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .info-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .info-list li {
          margin-bottom: 10px;
          font-size: 14px;
        }
        .info-list strong {
          color: #4b5563;
          width: 100px;
          display: inline-block;
        }
        .otp-code {
          font-size: 36px;
          font-weight: 800;
          color: #3b61c0;
          letter-spacing: 4px;
          margin: 24px 0;
          text-align: center;
        }
        .highlight-box {
          background-color: #eff6ff;
          border-left: 4px solid #3b61c0;
          padding: 16px;
          margin: 20px 0;
          border-radius: 4px;
        }
        @media only screen and (max-width: 600px) {
          .container {
            margin: 0;
            border-radius: 0;
          }
          .content {
            padding: 24px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${businessName}</h1>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${businessName}. All rights reserved.<br>
          This is an automated message, please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Simple Template Parser
 * Replaces {{key}} with values from the data object.
 */
export const parseTemplate = (text, data) => {
  return text.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    return data[key.trim()] || match;
  });
};
