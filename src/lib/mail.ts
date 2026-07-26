import nodemailer from "nodemailer";

type MailMessage = { to: string; subject: string; text: string; html?: string; replyTo?: string };

let transporter: nodemailer.Transporter | undefined;
let verification: Promise<void> | undefined;

function smtpConfigured() {
  return process.env.MAIL_MODE === "smtp" && Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM_EMAIL);
}

function getTransporter() {
  if (!smtpConfigured()) return undefined;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

export function isMailConfigured() {
  return smtpConfigured();
}

export function verifySmtpOnStart() {
  const transport = getTransporter();
  if (!transport || process.env.SMTP_VERIFY_ON_START !== "true") return;
  if (!verification) {
    verification = transport.verify().then(() => {
      console.info("mail.smtp_verified");
    }).catch((error: unknown) => {
      console.error("mail.smtp_verification_failed", error instanceof Error ? error.message : "unknown error");
      throw error;
    });
  }
}

export async function sendMail(message: MailMessage) {
  if (process.env.MAIL_MODE === "record") {
    console.info("mail.recorded", { to: message.to, subject: message.subject });
    return true;
  }
  const transport = getTransporter();
  if (!transport) return false;
  verifySmtpOnStart();
  if (verification) await verification;
  await transport.sendMail({
    from: { name: process.env.MAIL_FROM_NAME || "Aviator Brewing Company", address: process.env.MAIL_FROM_EMAIL! },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo || process.env.MAIL_REPLY_TO || process.env.MAIL_FROM_EMAIL,
  });
  return true;
}
