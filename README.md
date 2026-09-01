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

로컬 Vite가 `/v1`·`/assets`를 이 서버로 프록시합니다. 프론트는 same-origin 상대경로를 쓰고, `VITE_USE_MOCK=true`일 때만 mock입니다.

## P0 구현 메모

단계별 API·예외·패턴·주의점: [`docs/p0/README.md`](docs/p0/README.md).

## 다음 작업

1. Postgres (`user_profiles` / `banks` / `user_roles`) 연결
2. `AuthService.completeSignup` 실구현 (Auth 유저 + profile + CONSUMER role)
3. OCTOMO 프록시 모듈
4. 로그인·세션 JWT

스펙: `NT/docs/domains/api-spec.md`, `NT/docs/domains/auth.md`
