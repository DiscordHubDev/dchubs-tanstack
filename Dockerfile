FROM oven/bun:latest

RUN apt-get update && apt-get install -y git libpq5 iproute2 zip tar curl && rm -rf /var/lib/apt/lists/*3 && useradd -m -d /home/container container

RUN bun upgrade

USER container
ENV USER=container HOME=/home/container
WORKDIR /home/container

COPY .output/server .

STOPSIGNAL SIGINT

COPY        --chown=container:container ./../entrypoint.sh /entrypoint.sh
RUN         chmod +x /entrypoint.sh
ENTRYPOINT    ["/usr/bin/tini", "-g", "--"]
CMD         ["/entrypoint.sh"]