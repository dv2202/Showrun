FROM node:22-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

# Install through the locked Playwright package so Chromium and Playwright
# always match. --with-deps adds the browser's Linux system libraries.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && npx playwright install --with-deps chromium

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    PLAYWRIGHT_HEADLESS=true

USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
