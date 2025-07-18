import model from "../db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saveUserOrgInstall = async (installation: any) => {
  try {
    console.log(
      "Attempting to save org installation for enterprise ID:",
      installation.enterprise.id,
    );
    const resp = await model.SlackUser.updateOne(
      { _id: installation.enterprise.id },
      {
        _id: installation.enterprise.id,
        team: "null",
        enterprise: {
          id: installation.enterprise.id,
          name: installation.enterprise.name,
        },
        user: {
          token: installation.user.token,
          scopes: installation.user.scopes,
          id: installation.user.id,
        },
        tokenType: installation.tokenType,
        isEnterpriseInstall: installation.isEnterpriseInstall,
        appId: installation.appId,
        authVersion: installation.authVersion,
        bot: "null",
      },
      { upsert: true },
    );
    console.log("Org installation save result:", resp);
    return resp;
  } catch (error) {
    console.error("Error saving org installation:", error);
    return error;
  }
};

export default { saveUserOrgInstall };
