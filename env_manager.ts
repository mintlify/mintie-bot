import { envVars } from "./types";

function getEnvs(): envVars {
  return {
    ...validateEnvironment(),
  };
}

function validateEnvironment(): envVars {
  const requiredVars: (keyof envVars)[] = [
    "SLACK_SIGNING_SECRET",
    "PORT",
    "SLACK_CLIENT_ID",
    "SLACK_CLIENT_SECRET",
  ];

  const missing: string[] = [];
  const config: Partial<envVars> = {};

  for (const varName of requiredVars) {
    const value = process.env[varName];

    if (!value || value.trim() === "") {
      missing.push(varName);
    } else {
      config[varName] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Please ensure all required environment variables are set in your .env file.",
    );
  }

  return {
    ...(config as envVars),
  };
}

export { getEnvs };
