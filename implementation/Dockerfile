FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build
WORKDIR /app
COPY implementation/package.json implementation/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY implementation/ ./
COPY prototype-v13/template.html prototype-v13/assessment.css /prototype-v13/
RUN npm run build
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
RUN apk add --no-cache font-dejavu poppler-utils
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
ENV NODE_ENV=production PORT=8088
EXPOSE 8088
CMD ["node","src/server.mjs"]
