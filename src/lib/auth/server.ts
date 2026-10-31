import "server-only";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { createAuth } from "./core";

export function getAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) throw new Error("Authentication configuration is missing");
  const url = new URL(baseURL);
  const localHttp = process.env.AUTH_ALLOW_LOCAL_HTTP === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (process.env.NODE_ENV !== "production" || localHttp))) throw new Error("HTTPS is required");
  return createAuth(db, { secret, baseURL, secure: baseURL.startsWith("https://"), sendReset: async (email, url) => {
    if (!process.env.SMTP_URL || !process.env.SMTP_FROM) throw new Error("Password reset mail is not configured");
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.SMTP_FROM, to: email, subject: "Reset your SubWise password", text: `Reset your password within 15 minutes: ${url}\nIf you did not request this, ignore this message.` });
  } });
}
