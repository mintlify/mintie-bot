import model from "./db";
import { EventType, logEvent } from "../utils/logging";

const findUser = async (id: string) => {
  try {
    const user = await model.SlackUser.find({ _id: id });
    logEvent({
      text: `Finding installation for ID: ${id}`,
      eventType: EventType.APP_INFO,
    });
    logEvent({
      text: `Found user data: ${user}`,
      eventType: EventType.APP_INFO,
    });
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
