#!/bin/bash
cd /home/container

if [ -f ".env" ]; then
    echo "Loading environment variables from .env file..."
    tr -d '\r' < .env > .env.unix
    
    set -a
    source .env.unix
    set +a
    
    # 載入完畢後刪除暫存檔
    rm .env.unix
fi

if [ -d "/app/server" ]; then
    cd /app/server
else
    cd /home/container
fi

INTERNAL_IP=$(ip route get 1 | awk '{print $(NF-2);exit}')
export INTERNAL_IP

export PORT=${SERVER_PORT}

bun -v

MODIFIED_STARTUP=$(echo -e ${STARTUP} | sed -e 's/{{/${/g' -e 's/}}/}/g')
echo -e ":/home/container$ ${MODIFIED_STARTUP}"

eval ${MODIFIED_STARTUP}