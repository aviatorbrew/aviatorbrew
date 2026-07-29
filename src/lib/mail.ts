import nodemailer from "nodemailer";
import path from "node:path";
import { findCustomLogo } from "@/lib/site-branding";

type MailAttachment = { filename: string; path: string; cid?: string; contentType?: string };
type MailMessage = { to: string; subject: string; text: string; html?: string; replyTo?: string; attachments?: MailAttachment[] };

let transporter: nodemailer.Transporter | undefined;
let verification: Promise<boolean> | undefined;

function mailConfigured() {
  if (process.env.MAIL_MODE === "sendmail") return Boolean(process.env.MAIL_FROM_EMAIL);
  return process.env.MAIL_MODE === "smtp" && Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM_EMAIL);
}

function getTransporter() {
  if (!mailConfigured()) return undefined;
  if (!transporter) {
    if (process.env.MAIL_MODE === "sendmail") {
      transporter = nodemailer.createTransport({ sendmail: true, newline: "unix", path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail" });
    } else {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
    }
  }
  return transporter;
}

export function isMailConfigured() {
  return mailConfigured();
}

export function verifySmtpOnStart() {
  const transport = getTransporter();
  if (!transport || process.env.MAIL_MODE !== "smtp" || process.env.SMTP_VERIFY_ON_START !== "true") return;
  if (!verification) {
    verification = transport.verify().then(() => {
      console.info("mail.smtp_verified");
      return true;
    }).catch((error: unknown) => {
      console.error("mail.smtp_verification_failed", error instanceof Error ? error.message : "unknown error");
      transporter = undefined;
      verification = undefined;
      return false;
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
  if (process.env.MAIL_MODE === "smtp") {
    verifySmtpOnStart();
    if (verification && !await verification) throw new Error("SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD.");
  }
  const attachments = [...(message.attachments || [])];
  if (message.html?.includes("cid:aviator-logo") && !attachments.some((attachment) => attachment.cid === "aviator-logo")) {
    const customLogo = await findCustomLogo();
    attachments.push({
      filename: customLogo ? "aviator-logo" + customLogo.extension : "aviator-logo.png",
      path: customLogo?.file || path.join(process.cwd(), "public", "images", "aviator-logo.png"),
      cid: "aviator-logo",
      contentType: customLogo?.contentType || "image/png",
    });
  }
  await transport.sendMail({
    from: { name: process.env.MAIL_FROM_NAME || "Aviator Brewing Company", address: process.env.MAIL_FROM_EMAIL! },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments,
    replyTo: message.replyTo || process.env.MAIL_REPLY_TO || process.env.MAIL_FROM_EMAIL,
  });
  return true;
}
