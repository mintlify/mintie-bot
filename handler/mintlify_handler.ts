import { getMintlifyAssistantAPIKey } from "../operator/mintlify_operator";

export const handleCreateMintlifyAssistantKey = async () => {
  const apiKey = await getMintlifyAssistantAPIKey();

  if (!apiKey) {
    throw new Error("Failed to create Mintlify assistant key");
  }

  return apiKey;
};
