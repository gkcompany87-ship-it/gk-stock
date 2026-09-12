# Local development ONLY. Archived MinIO Community, AGPL-3.0.
# Build the last verified community security release, not an AIStor image tag.
FROM golang:1.25-bookworm AS build
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
RUN git clone --depth 1 --branch "$MINIO_RELEASE" https://github.com/minio/minio.git /src
WORKDIR /src
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/minio .
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 --create-home minio \
 && mkdir /data && chown minio:minio /data
COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /usr/share/doc/minio/LICENSE
USER minio
EXPOSE 9000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD curl -fsS http://localhost:9000/minio/health/live || exit 1
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
