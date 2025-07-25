import model from "./db";

const findUser = async (id: string) => {
  try {
    const user = await model.SlackUser.find({ _id: id });
    if (user[0] !== undefined) {
      const userData = user[0].toObject();
      return userData;
    }
  } catch (error) {
    console.error("Database error finding user:", error);
    throw new Error(`Failed to fetch installation for ${id}: ${error}`);
  }
  throw new Error(`No installation found for ${id}`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decryptUserSecrets = (userData: any) => {
  const secrets: { botToken: string | null; apiKey: string | null } = {
    botToken: null,
    apiKey: null,
  };

  if (userData?.bot?.encryptedToken) {
    secrets.botToken = model.decrypt(userData.bot.encryptedToken);
  }
  if (userData?.encryptedApiKey) {
    secrets.apiKey = model.decrypt(userData.encryptedApiKey);
  }

  return secrets;
};

export default { findUser, decryptUserSecrets };
