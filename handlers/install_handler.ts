import { IncomingMessage, ServerResponse } from "http";
import { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import { processCustomInstall } from "../operators/install_operator";
import { Installation, InstallURLOptions } from "@slack/bolt";
import { processInstallationSuccess } from "../operators/install_operator";

export const handleCustomInstallRoute = async (
  req: ParamsIncomingMessage,
  res: ServerResponse,
) => {
  await processCustomInstall(req, res);
};

export const handleInstallationSuccess = async (
  installation: Installation<"v1" | "v2", boolean>,
  installOptions: InstallURLOptions,
  req: IncomingMessage,
  res: ServerResponse,
) => {
  await processInstallationSuccess(installation, installOptions, req, res);
};
