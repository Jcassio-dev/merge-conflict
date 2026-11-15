# Painel: build com Node, servido como arquivos estáticos pelo nginx.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Mesmo domínio do WorkAdventure: o painel fica em /painel/ e a API em /painel/api/.
ARG PAINEL_BASE=/painel/
ARG VITE_API_URL=/painel
ENV PAINEL_BASE=$PAINEL_BASE VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
