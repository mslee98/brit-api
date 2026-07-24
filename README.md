# brit-api

Brit 백엔드 (Nest.js). NT(Vite)와 형제 경로에 둡니다.

```text
이민성/
  NT/
  brit-api/   ← 여기
```

## 실행

```bash
cp .env.example .env
npm install
npm run start:dev
```

- Health: `GET http://localhost:3000/v1/health`
- 닉네임: `GET http://localhost:3000/v1/auth/nickname/check?nickname=테스트`
- 가입: `POST http://localhost:3000/v1/auth/signup` (현재 DB 미연동 → 501)

## NT 연결

`NT/.env` (또는 `.env.local`):

```env
VITE_API_BASE_URL=http://localhost:3000
```

프론트 `auth.api`는 `VITE_API_BASE_URL`이 있으면 HTTP adapter를 우선 사용합니다.

## 다음 작업

1. Postgres (`user_profiles` / `banks` / `user_roles`) 연결
2. `AuthService.completeSignup` 실구현 (Auth 유저 + profile + CONSUMER role)
3. OCTOMO 프록시 모듈
4. 로그인·세션 JWT

스펙: `NT/docs/domains/api-spec.md`, `NT/docs/domains/auth.md`
