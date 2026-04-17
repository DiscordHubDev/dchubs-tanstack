FROM oven/bun:slim

LABEL author="Mantouisyummy" maintainer="opcantel@gmail.com"

RUN apt-get update \
    && apt-get -y install --no-install-recommends \
        ffmpeg \
        iproute2 \
        git \
        sqlite3 \
        libsqlite3-dev \
        python3 \
        ca-certificates \
        dnsutils \
        tzdata \
        zip \
        tar \
        curl \
        libtool \
        tini \
        libpq5 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -d /home/container container

WORKDIR /app

COPY .output/server ./server
COPY .output/public ./public

RUN chown -R container:container /app

WORKDIR /home/container

USER container
ENV USER=container HOME=/home/container NODE_ENV=production

STOPSIGNAL SIGINT

COPY --chown=container:container ./entrypoint.sh /entrypoint.sh
USER root
RUN chmod +x /entrypoint.sh
USER container

ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["/entrypoint.sh"]