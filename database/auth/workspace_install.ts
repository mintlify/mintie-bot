import model from "../db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saveUserWorkspaceInstall = async (installation: any) => {
  try {
    console.log(
      "Attempting to save workspace installation for team ID:",
      installation.team.id,
    );
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
          token: installation.bot.token,
          userId: installation.bot.userId,
          id: installation.bot.id,
        },
      },
      { upsert: true },
    );
    console.log("Workspace installation save result:", resp);
    return resp;
  } catch (error) {
    console.error("Error saving workspace installation:", error);
    return error;
  }
};

export default { saveUserWorkspaceInstall };
