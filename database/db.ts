import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import crypto from "crypto";
import { EventType } from "../types";
import { logEvent } from "../utils/logging";
import { usersSchema } from "./SlackUser";

const uri = process.env.MONGODB_URI || "";
const encryptionKey = process.env.ENCRYPTION_LOCAL_KEY;

if (!encryptionKey) {
  throw new Error("ENCRYPTION_LOCAL_KEY is not set in environment variables");
}

const encrypt = (text: string): string => {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(encryptionKey, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

const decrypt = (encryptedText: string): string => {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(encryptionKey, "salt", 32);
  const textParts = encryptedText.split(":");
  const iv = Buffer.from(textParts.shift() || "", "hex");
  const encryptedData = textParts.join(":");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

const connect = async () => {
  let db;
  try {
    await mongoose.connect(uri);
    db = mongoose.connection.db;

    logEvent({
      text: "Connected to MongoDB with manual encryption",
      eventType: EventType.APP_INFO,
    });
  } catch (error) {
    logEvent({
      text: "Failed to connect to MongoDB",
      eventType: EventType.APP_INFO,
    });
    throw error;
  }

  return db;
};

const getDB = async () => {
  const db = await connect();
  return db;
};

const SlackUser = mongoose.model("SlackUsers", usersSchema, "slackUsers");

export default { SlackUser, connect, getDB, encrypt, decrypt };
