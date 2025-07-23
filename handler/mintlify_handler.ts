interface MintlifyAssistantAPIKeyResponse {
  keyId: string;
  key: string;
  createdAt: string;
}

export const getMintlifyAssistantAPIKey = async () => {
  const response = (await fetch(
    `${process.env.API_URL}/api/deployment/discovery-api-key/mintlify`,
  ).then((res) => res.json())) as MintlifyAssistantAPIKeyResponse;

  return response.key;
};
