# ---- Build Stage ----
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc

# ---- Production Stage ----
FROM node:18-alpine AS prod
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000

RUN curl -1sLf \
'https://artifacts-cli.infisical.com/setup.deb.sh' \
| sudo -E bash

RUN sudo apt-get update && sudo apt-get install -y infisical

CMD ["infisical", "run", "--env=prod", "node", "dist/index.js"] 