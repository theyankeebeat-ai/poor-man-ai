FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/brain .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/brain /app/brain
COPY data /app/data
ENV PORT=8080
ENV BRAIN_CORPUS=/app/data
EXPOSE 8080
CMD ["/app/brain"]
