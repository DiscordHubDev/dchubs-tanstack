# 建議考慮使用 slim 版本，例如 FROM oven/bun:slim
FROM oven/bun:latest

LABEL author="Mantouisyummy" maintainer="opcantel@gmail.com"

# 1. 集中執行 apt 命令，並在結尾強制清理快取與暫存檔
# 2. 如果可以，請嘗試把 build-essential 和 python3-dev 移除，除非你的程式在執行期真的會用到它們
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
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -d /home/container container

USER container
ENV USER=container HOME=/home/container
WORKDIR /home/container

# 確保你的 .dockerignore 有設定好，避免把本機龐大的 node_modules 或日誌檔也 copy 進去
COPY .output/server .

STOPSIGNAL SIGINT

COPY --chown=container:container ./../entrypoint.sh /entrypoint.sh

# 這邊把權限設定移到 root 階段，或是如果你要在 user 階段執行，要確保 user 有權限
# 不過更乾淨的做法是事先在本機就將 entrypoint.sh 賦予執行權限
USER root
RUN chmod +x /entrypoint.sh
USER container

ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["/entrypoint.sh"]