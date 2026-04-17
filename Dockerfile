# 使用 slim 版本可以大幅減少 Image 體積
FROM oven/bun:slim

LABEL author="Mantouisyummy" maintainer="opcantel@gmail.com"

# 1. 集中安裝依賴並清理
# 額外加入 libpq5 以確保 PostgreSQL 連線正常 (根據你先前的報錯)
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

# --- 關鍵修改：將代碼放在 /app 避開掛載點 ---
WORKDIR /app
# 複製 .output/server 到 /app
COPY .output/server .

# 修正權限：讓 container 使用者可以存取 /app
RUN chown -R container:container /app

# 設定 Pterodactyl 預設工作目錄 (雖然我們代碼在 /app)
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