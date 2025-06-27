ARG BUILD_FROM
FROM $BUILD_FROM

WORKDIR /app/smartvanio

# Install Node.js (add Alpine packages manually)
RUN apk add --no-cache nodejs npm
RUN apk add --no-cache git bash


# Install deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy everything (Next.js source, public, etc.)
COPY . .

# Add start script
COPY start.sh /
RUN chmod a+x /start.sh

COPY install-integration.sh /install-integration.sh
RUN chmod +x /install-integration.sh

COPY install-cards.sh /install-cards.sh
RUN chmod +x /install-cards.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/start.sh"]
