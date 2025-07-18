import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.MONGODB_URI || "";

const connect = async function () {
  try {
    await mongoose.connect(uri);
    console.log("✅ Connected to MongoDB successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
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
  },
  { _id: false },
);

const SlackUser = mongoose.model("SlackUsers", usersSchema, "slackUsers");

export default { SlackUser, connect };
