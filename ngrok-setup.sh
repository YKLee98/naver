#!/bin/bash

# ngrok 설정 스크립트 (Windows Git Bash 호환)
# 사용법: ./ngrok-setup.sh <ngrok-url>

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

if [ -z "$1" ]; then
    echo -e "${YELLOW}사용법: ./ngrok-setup.sh <ngrok-url>${NC}"
    echo -e "${YELLOW}예시: ./ngrok-setup.sh https://abc123.ngrok-free.app${NC}"
    exit 1
fi

NGROK_URL=$1

echo -e "\n${YELLOW}📝 설정 업데이트 중: $NGROK_URL${NC}\n"

# 루트 .env 업데이트
if [ -f ".env" ]; then
    # ngrok_url 라인이 있으면 업데이트, 없으면 추가
    if grep -q "ngrok_url=" .env; then
        sed -i "s|ngrok_url=.*|ngrok_url=$NGROK_URL|" .env
    else
        echo "ngrok_url=$NGROK_URL" >> .env
    fi
    echo -e "${GREEN}✅ 루트 .env 업데이트 완료${NC}"
fi

# 프론트엔드 .env 생성
cat > packages/frontend/.env << EOF
# ngrok 설정
VITE_NGROK_URL=$NGROK_URL
VITE_API_URL=/api/v1
EOF

echo -e "${GREEN}✅ 프론트엔드 .env 생성 완료${NC}"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✨ 설정 완료!${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "${YELLOW}📋 사용 방법:${NC}"
echo -e "1. ngrok 실행: ${YELLOW}ngrok http 5173${NC}"
echo -e "2. 서버 실행: ${YELLOW}pnpm dev${NC}"
echo -e "3. 접속: ${YELLOW}$NGROK_URL${NC}\n"

echo -e "${GREEN}📱 모바일 접속 URL:${NC}"
echo -e "   $NGROK_URL"