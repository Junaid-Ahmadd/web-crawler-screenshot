# Use official Deno image
FROM denoland/deno:1.38.3

# Set working directory
WORKDIR /app

# Copy dependency files
COPY dependencies.ts .
RUN deno cache dependencies.ts

# Copy the rest of the application
COPY . .

# Compile the app
RUN deno cache server.ts

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-read", "server.ts"]
