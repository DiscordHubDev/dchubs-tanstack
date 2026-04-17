#!/bin/bash
if [ -f "/home/container/.env" ]; then
    ln -sf /home/container/.env /app/.env
    echo "linked .env to /app/.env"
fi

if [ -d "/app" ]; then
    cd /app
else
    cd /home/container
fi

INTERNAL_IP=$(ip route get 1 | awk '{print $(NF-2);exit}')
export INTERNAL_IP

export PORT=${SERVER_PORT}

bun -v

MODIFIED_STARTUP=$(echo -e ${STARTUP} | sed -e 's/{{/${/g' -e 's/}}/}/g')

echo -e ":/app$ ${MODIFIED_STARTUP}"

eval ${MODIFIED_STARTUP}