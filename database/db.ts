import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Cryptr from "cryptr";
import { EventType } from "../types";
import { logEvent } from "../utils/logging";
import { usersSchema } from "./SlackUser";

const uri = process.env.MONGODB_URI || "";
const encryptionKey = process.env.ENCRYPTION_KEY;

if (!encryptionKey) {
  throw new Error("ENCRYPTION_KEY is not set in environment variables");
}

const cryptr = new Cryptr(encryptionKey);

const encrypt = (text: string): string => {
  return cryptr.encrypt(text);
};

const decrypt = (encryptedText: string): string => {
  return cryptr.decrypt(encryptedText);
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
