import db from "../database/db";

export const getMintlifyAssistantAPIKey = async () => {
  interface MintlifyAssistantAPIKeyResponse {
    keyId: string;
    key: string;
    createdAt: string;
  }

  const response = (await fetch(
    `${process.env.API_URL}/api/deployment/discovery-api-key/mintlify`,
  ).then((res) => res.json())) as MintlifyAssistantAPIKeyResponse;

  return response.key;
};

export const constructDocumentationURL = async (
  subdomain: string,
): Promise<string> => {
  const dbInstance = await db.getDB();

  const deployment = await dbInstance?.collection("deployments").findOne({
    subdomain: subdomain,
  });

  if (deployment) {
    if (deployment.customDomain) {
      return `https://${deployment.customDomain}${deployment.basePath || ""}`;
    } else {
      return `https://${subdomain}.mintlify.app${deployment.basePath || ""}`;
    }
  } else {
    throw new Error("Docs deployment not found");
  }
};
