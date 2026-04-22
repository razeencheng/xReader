FROM golang:1.25-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/api ./cmd/api
RUN CGO_ENABLED=0 go build -o /app/worker ./cmd/worker

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /app/api /app/api
COPY --from=builder /app/worker /app/worker
EXPOSE 8080
CMD ["/app/api"]
