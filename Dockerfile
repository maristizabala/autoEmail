# Stage 1: Build the Vite application
FROM node:20-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:stable-alpine
# Copiar el build de Vite
COPY --from=build-stage /app/dist /usr/share/nginx/html
# Copiar nuestra configuración de Nginx con el proxy configurado
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
