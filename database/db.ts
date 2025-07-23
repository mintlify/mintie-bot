import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { EventType } from "../types";
import { logEvent } from "../utils/logging";
import { usersSchema } from "./SlackUser";

const uri = process.env.MONGODB_URI || "";

const connect = async () => {
  let db;
  try {
    await mongoose.connect(uri);
    db = mongoose.connection.db;

    logEvent({
      text: "Connected to MongoDB",
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

const domainConfigSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const SlackUser = mongoose.model("SlackUsers", usersSchema, "slackUsers");
const DomainConfig = mongoose.model(
  "DomainConfigs",
  domainConfigSchema,
  "domainConfigs",
);

export default { SlackUser, DomainConfig, connect, getDB };
