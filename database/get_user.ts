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

const isConfigured = async (teamId: string): Promise<boolean> => {
  try {
    const user = await findUser(teamId);
    return user?.mintlify?.isConfigured === true;
  } catch (error) {
    logEvent({
      text: `Error checking team configuration: ${error}`,
      eventType: EventType.APP_ERROR,
    });
    return false;
  }
};

export default { findUser, isConfigured };
