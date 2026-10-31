import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
export type Delivery = (to: string, message: { subject: string; text: string }) => Promise<"SENT" | "PREVIEWED">;
export const deliverReminder: Delivery = async (to, message) => {
  if (!process.env.SMTP_URL || !process.env.SMTP_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP unavailable");
    return "PREVIEWED";
  }
  const transport = nodemailer.createTransport(new SMTPTransport({ url: process.env.SMTP_URL, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 }));
  await transport.sendMail({ from: process.env.SMTP_FROM, to, ...message });
  return "SENT";
};


