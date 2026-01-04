FROM mcr.microsoft.com/playwright:v1.46.0-jammy
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY server.js ./
EXPOSE 3000
CMD ["node","server.js"]
