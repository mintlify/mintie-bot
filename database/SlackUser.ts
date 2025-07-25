import mongoose from "mongoose";

export const usersSchema = new mongoose.Schema(
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
      encryptedToken: String,
      userId: String,
      id: String,
    },
    subdomain: String,
    encryptedApiKey: String,
    isConfigured: Boolean,
    createdAt: Date,
  },
  { _id: false },
);
