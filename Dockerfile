# Use Node.js LTS (Alpine for smaller image)
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (leverage Docker layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY src ./src

# Environment configuration (override at runtime as needed)
ENV NODE_ENV=production
ENV PORT=8080

# Expose the default app port
EXPOSE 8080

# Run the app
CMD ["npm", "start"]
