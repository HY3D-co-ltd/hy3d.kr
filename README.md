# HY3D 브랜드 홈페이지

하이쓰리디의 제조·교육·AI 솔루션을 소개하는 국문·영문 정적 홈페이지입니다.

홈페이지: https://hy3d.kr/

## 로컬 실행

Node.js 24 이상에서 별도 패키지 설치 없이 실행합니다.

```sh
npm start
```

미리보기 주소는 `http://127.0.0.1:4173`입니다.

## 수정과 검증

- `docs/content.js`: 한국어·영어 문구
- `docs/index.html`: 페이지 구성과 한국어 기본 문구
- `docs/styles.css`: 반응형 스타일
- `docs/app.js`: 언어 전환, 사업 탭, 메뉴
- `docs/assets/`: 공개용 이미지와 로고

문구를 수정한 뒤 한국어 HTML을 동기화하고 검사합니다.

```sh
npm run sync-copy
npm run check
```

## 배포

GitHub Pages의 `Deploy from a branch`를 사용합니다. 게시 브랜치는 `main`, 게시 폴더는 `/docs`입니다. `main`에 푸시하면 GitHub가 정적 사이트를 갱신합니다. 별도 서버나 배포 토큰이 필요하지 않습니다.

회사 도메인은 `hy3d.kr`입니다. `docs/CNAME`과 Pages 설정의 Custom domain을 동일하게 유지하고, 도메인 DNS는 GitHub Pages를 가리키도록 설정합니다. `docs/index.html`의 canonical·Open Graph 주소와 `docs/sitemap.xml`은 `https://hy3d.kr/`을 사용합니다.

## 공개 콘텐츠 관리

이 저장소에는 홈페이지에 공개할 코드와 이미지만 보관합니다. 내부 기획 문서, 원본 회사소개서, 운영 데이터, 환경변수, 인증 정보와 검토 산출물은 추가하지 않습니다. 성과 수치는 공개 범위와 사실관계를 확인한 후 반영합니다.

브랜드명·로고·이미지의 권리는 각 권리자에게 있습니다.
