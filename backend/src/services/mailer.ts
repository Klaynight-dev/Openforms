import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || "587");
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || "no-reply@openforms.org";

let transporter: any = null;

try {
  if (smtpHost && smtpUser && smtpPass) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    console.log("Mailer initialized with SMTP transport.");
  } else {
    console.log("Mailer initialized in Dev/Console mode (no SMTP credentials found).");
  }
} catch (err) {
  console.error("Failed to initialize mail transporter:", err);
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}) {
  console.log(`[MAILER] Sending email to ${to} with subject "${subject}"`);
  if (!transporter) {
    console.log(`[MAILER MOCK CONTENT]:\nText: ${text}\nHTML: ${html}`);
    return { mock: true, messageId: "mock-id" };
  }

  try {
    const info = await transporter.sendMail({
      from: smtpFrom,
      to,
      subject,
      text,
      html,
    });
    console.log(`[MAILER] Email sent successfully. Message ID: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[MAILER] Failed to send email to ${to}:`, err);
    throw err;
  }
}
