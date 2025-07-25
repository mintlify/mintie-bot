import model from "../db";
import { EventType } from "../../types";
import { logEvent } from "../../utils/logging";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saveUserWorkspaceInstall = async (installation: any) => {
  try {
    logEvent({
      text: `Attempting to save workspace installation for team ID: ${installation.team.id}`,
      eventType: EventType.APP_INFO,
    });

    const resp = await model.SlackUser.updateOne(
      { _id: installation.team.id },
      {
        _id: installation.team.id,
        team: { id: installation.team.id, name: installation.team.name },
        enterprise: { id: "null", name: "null" },
        user: { token: "null", scopes: "null", id: installation.user.id },
        tokenType: installation.tokenType,
        isEnterpriseInstall: installation.isEnterpriseInstall,
        appId: installation.appId,
        authVersion: installation.authVersion,
        bot: {
          scopes: installation.bot.scopes,
          token: model.encrypt(installation.bot.token),
          userId: installation.bot.userId,
          id: installation.bot.id,
        },
      },
      { upsert: true },
    );
    logEvent({
      text: `Workspace installation save result: ${resp}`,
      eventType: EventType.APP_INFO,
    });
    return resp;
  } catch (error) {
    logEvent({
      text: `Error saving workspace installation: ${error}`,
      eventType: EventType.APP_ERROR,
    });
    return error;
  }
};

export default { saveUserWorkspaceInstall };
