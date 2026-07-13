import nodemailer from "nodemailer";

// --- Configuration Resend (API HTTP, prioritaire) ---
const resendApiKey = process.env.RESEND_API_KEY;
// Resend exige une adresse d'un domaine vérifié ; on retombe sur SMTP_FROM sinon.
const mailFrom = process.env.RESEND_FROM || process.env.SMTP_FROM || "no-reply@openforms.org";

// --- Configuration SMTP (nodemailer, fallback) ---
const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || "587");
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || "no-reply@openforms.org";

let transporter: any = null;

if (resendApiKey) {
  console.log("Mailer initialized with Resend transport.");
} else {
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
      console.log("Mailer initialized in Dev/Console mode (no Resend/SMTP credentials found).");
    }
  } catch (err) {
    console.error("Failed to initialize mail transporter:", err);
  }
}

/** Envoi via l'API HTTP Resend (aucune dépendance : simple fetch). */
async function sendViaResend(params: { to: string; subject: string; html?: string; text?: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    throw new Error(`Resend a répondu ${res.status}: ${payload?.message ?? "erreur inconnue"}`);
  }
  return { messageId: payload.id ?? "resend-id", provider: "resend" as const };
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

  // 1. Resend (si configuré)
  if (resendApiKey) {
    try {
      const info = await sendViaResend({ to, subject, html, text });
      console.log(`[MAILER] Email sent via Resend. Message ID: ${info.messageId}`);
      return info;
    } catch (err) {
      console.error(`[MAILER] Resend failed to send email to ${to}:`, err);
      throw err;
    }
  }

  // 2. Mode console (aucun transport configuré)
  if (!transporter) {
    console.log(`[MAILER MOCK CONTENT]:\nText: ${text}\nHTML: ${html}`);
    return { mock: true, messageId: "mock-id" };
  }

  // 3. SMTP (nodemailer)
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
