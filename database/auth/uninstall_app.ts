import model from "../db";
import { EventType } from "../../types";
import { logEvent } from "../../utils/logging";

const uninstallApp = async (teamId: string) => {
  try {
    const installationId = teamId;

    const result = await model.SlackUser.deleteOne({ _id: installationId });

    if (result.deletedCount > 0) {
      logEvent({
        text: `Successfully removed installation for ID: ${installationId}`,
        eventType: EventType.APP_INFO,
      });
    } else {
      logEvent({
        text: `No installation found to remove for ID: ${installationId}`,
        eventType: EventType.APP_INFO,
      });
    }

    return result;
  } catch (error) {
    logEvent({
      text: `Error removing installation: ${error}`,
      eventType: EventType.APP_ERROR,
    });
    throw error;
  }
};

export default { uninstallApp };
