# Build Stage
FROM golang:1.27.3-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Cache Go modules
COPY go.mod go.sum* ./
RUN go mod download || true

# Copy source
COPY . .

# Build statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/bin/server ./cmd/server

# Final Stage
FROM alpine:3.20

WORKDIR /app

# Install runtime dependencies for TLS verification to Neon PostgreSQL and timezone data
RUN apk add --no-cache ca-certificates tzdata

# Non-root user
RUN addgroup -S devflow && adduser -S devflow -G devflow
USER devflow

COPY --from=builder /app/bin/server /app/server

EXPOSE 8080

ENTRYPOINT ["/app/server"]

