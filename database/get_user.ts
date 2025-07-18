import model from "./db";

const findUser = async (id: string) => {
  try {
    const user = await model.SlackUser.find({ _id: id });
    console.log("Finding installation for ID:", id);
    console.log("Found user data:", user);
    if (user[0] !== undefined) {
      return user[0];
    }
  } catch (error) {
    console.error("Database error finding user:", error);
    throw new Error(`Failed to fetch installation for ${id}: ${error}`);
  }
  throw new Error(`No installation found for ${id}`);
};

export default { findUser };
