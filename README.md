# 🔪 SJL Studio - 마피아 게임

AI 진행자가 자동으로 게임을 운영하는 온라인 멀티플레이어 마피아 게임

## 게임 소개

- **4~12명** 실시간 온라인 플레이
- **AI 진행자**가 자동으로 게임 진행 (역할 배정, 페이즈 전환, 결과 발표)
- 역할: 마피아(🔪), 의사(💉), 경찰(🔍), 시민(👤)
- 낮/밤 페이즈, 투표, 채팅 지원
- 모바일/PC 모두 지원

## Render 배포 방법

1. [Render](https://render.com) 회원가입
2. Dashboard에서 **New > Web Service** 클릭
3. **Build and deploy from a Git repository** 선택
4. GitHub 계정 연결 후 이 레포지토리 선택
5. 설정:
   - **Branch**: `claude/online-multiplayer-mafia-game-8b9iox`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
6. **Deploy Web Service** 클릭
7. 몇 분 후 `https://your-app.onrender.com` URL 생성

## 로컬 실행

```bash
npm install
npm start
# http://localhost:3000
```

## 플레이 방법

1. 접속 후 닉네임 입력
2. **방 만들기** 또는 방 코드로 **참가하기**
3. 방 코드를 친구에게 공유
4. 4명 이상 모이면 방장이 게임 시작
5. AI 진행자의 안내에 따라 플레이
