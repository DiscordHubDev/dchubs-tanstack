#!/bin/bash
cd /home/container

if [ -f ".env" ]; then
    echo "Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
fi

INTERNAL_IP=$(ip route get 1 | awk '{print $(NF-2);exit}')
export INTERNAL_IP

export PORT=${SERVER_PORT}

bun -v

MODIFIED_STARTUP=$(echo -e ${STARTUP} | sed -e 's/{{/${/g' -e 's/}}/}/g')
echo -e ":/home/container$ ${MODIFIED_STARTUP}"

eval ${MODIFIED_STARTUP}