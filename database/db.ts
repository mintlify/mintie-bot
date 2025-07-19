import mongoose from "mongoose";
import dotenv from "dotenv";
import { EventType } from "../types";
import { logEvent } from "../utils/logging";
dotenv.config();

const uri = process.env.MONGODB_URI || "";

const connect = async function () {
  try {
    await mongoose.connect(uri);
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
};

const usersSchema = new mongoose.Schema(
  {
    _id: String,
    team: { id: String, name: String },
    enterprise: { id: String, name: String },
    user: { token: String, scopes: [String], id: String },
    tokenType: String,
    isEnterpriseInstall: Boolean,
    appId: String,
    authVersion: String,
    bot: {
      scopes: [String],
      token: String,
      userId: String,
      id: String,
    },
    mintlify: {
      domain: String,
      url: String,
      authKey: String,
      isConfigured: { type: Boolean, default: false },
    },
  },
  { _id: false },
);

const SlackUser = mongoose.model("SlackUsers", usersSchema, "slackUsers");

export default { SlackUser, connect };
