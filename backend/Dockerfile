FROM denoland/deno:1.39.1

WORKDIR /app

# Cache the dependencies
COPY dependencies.ts .
RUN deno cache dependencies.ts

# Copy the rest of the application
COPY . .

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-read", "server.ts"]
