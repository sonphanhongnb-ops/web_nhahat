# ---- THỨC by SEASOUND — image cho Fly.io ----
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

# Cài dependencies (chỉ runtime) — tận dụng cache layer
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Chép mã nguồn
COPY . .

# Fly định tuyến vào cổng nội bộ 8080
ENV PORT=8080
EXPOSE 8080

# node:sqlite cần cờ --experimental-sqlite (an toàn trên Node 22.5+/24)
CMD ["node", "--experimental-sqlite", "server.js"]
