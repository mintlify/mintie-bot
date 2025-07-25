import model from "./db";
const findUser = async (id: string) => {
  try {
    const user = await model.SlackUser.find({ _id: id });
    if (user[0] !== undefined) {
      const userData = user[0].toObject();

      if (userData.bot?.encryptedToken) {
        userData.bot.encryptedToken = model.decrypt(userData.bot.encryptedToken);
      }
      if (userData.encryptedApiKey) {
        userData.encryptedApiKey = model.decrypt(userData.encryptedApiKey);
      }

      return userData;
    }
  } catch (error) {
    console.error("Database error finding user:", error);
    throw new Error(`Failed to fetch installation for ${id}: ${error}`);
  }
  throw new Error(`No installation found for ${id}`);
};

export default { findUser };
