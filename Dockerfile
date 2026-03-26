# Imagen ligera de Nginx basada en Alpine
FROM nginx:alpine

# Crear usuario y grupo de sistema para mayor seguridad
RUN addgroup -S userAutoReport && adduser -S -G userAutoReport userAutoReport

# Crear directorios necesarios y ajustar permisos para usuario no-root
# Nginx necesita escribir en estas rutas para funcionar
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/run /etc/nginx/conf.d /etc/nginx/ssl && \
    chown -R userAutoReport:userAutoReport /var/cache/nginx /var/log/nginx /var/run /etc/nginx/conf.d /etc/nginx/ssl /usr/share/nginx/html

# Ajustar permisos del archivo PID (Nginx intentará escribir aquí)
RUN touch /var/run/nginx.pid && chown userAutoReport:userAutoReport /var/run/nginx.pid

# Copiar el build del proyecto
COPY --chown=userAutoReport:userAutoReport dist/ /usr/share/nginx/html/

# Copiar configuración de Nginx al directorio de sitios (no sobreescribir nginx.conf global)
COPY --chown=userAutoReport:userAutoReport nginx.conf /etc/nginx/conf.d/default.conf

# Instalar openssl para generar certificados autofirmados
RUN apk add --no-cache openssl

# Generar certificados SSL directamente (necesario para notificaciones)
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/server.key \
    -out /etc/nginx/ssl/server.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Asegurar que el usuario no-root tenga permisos sobre los certificados generados
RUN chown userAutoReport:userAutoReport /etc/nginx/ssl/server.key /etc/nginx/ssl/server.crt

# Cambiar al usuario no-root
USER userAutoReport

# Exponer el puerto configurado
EXPOSE 8004

# Iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]
