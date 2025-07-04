FROM node:24

WORKDIR /app

# Install dependencies and run tests after volume mount
CMD ["sh", "-c", "npm ci --include=dev && npm test"]
