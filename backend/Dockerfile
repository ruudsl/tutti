FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npx tsc

EXPOSE 3001

CMD ["node", "dist/index.js"]
