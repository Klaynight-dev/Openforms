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

/** Envoie le lien permettant à un compte fraîchement créé de définir son mot de passe. */
export async function sendInviteEmail(to: string, link: string) {
  return sendEmail({
    to,
    subject: "Votre compte OpenForms — définissez votre mot de passe",
    text: `Un compte OpenForms a été créé pour vous. Définissez votre mot de passe via ce lien (valable 48h) : ${link}`,
    html: `<div style="font-family:sans-serif;padding:20px;border:1px solid #eaeaea;border-radius:8px;">
      <h2 style="color:#673ab7;margin-top:0;">Bienvenue sur OpenForms</h2>
      <p>Un compte a été créé pour vous. Cliquez sur le lien ci-dessous pour définir votre mot de passe :</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#673ab7;color:#fff;border-radius:6px;text-decoration:none;">Définir mon mot de passe</a></p>
      <p style="font-size:12px;color:#999;">Ce lien est valable 48 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    </div>`,
  });
}
