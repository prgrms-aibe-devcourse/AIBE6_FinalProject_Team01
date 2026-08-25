<a id="readme-top"></a>

<img width="100%" alt="Plamingo header" src="https://capsule-render.vercel.app/api?type=waving&color=F26B7A&height=220&section=header&text=Plamingo&fontSize=50&fontColor=ffffff&fontAlignY=40&animation=fadeIn&desc=흩어진%20여행%20정보를,%20하나의%20지도와%20일정으로&descSize=18&descAlignY=62&descAlign=50&descFontColor=ffffff" />

<div align="center">
  <img width="132" alt="Plamingo 플라밍고 마스코트" src="frontend/public/assets/plamingo2-hero-v2.png" />

  <p>
    <img
      alt="사용자 맞춤형 여행 동선 최적화 및 공동 의사결정 플랫폼"
      src="https://readme-typing-svg.demolab.com?font=Pretendard&weight=600&size=23&pause=1200&color=C8596A&center=true&vCenter=true&width=720&lines=Plan+together.+Travel+smarter.;AI-powered+collaborative+travel+planning"
    />
  </p>

  <p>
    장소 탐색부터 투표, 날짜 조율, Day별 동선, 정산과 여행 기록까지<br/>
    함께 만드는 여행의 전 과정을 하나의 흐름으로 연결합니다.
  </p>

  <p>
    <a href="https://github.com/prgrms-aibe-devcourse/AIBE6_FinalProject_Team01/graphs/contributors"><img alt="Team contributors" src="https://img.shields.io/github/contributors/prgrms-aibe-devcourse/AIBE6_FinalProject_Team01?style=flat-square&label=team&color=C8596A" /></a>
    <a href="https://github.com/prgrms-aibe-devcourse/AIBE6_FinalProject_Team01/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/prgrms-aibe-devcourse/AIBE6_FinalProject_Team01?style=flat-square&label=issues&color=E493A4" /></a>
    <img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/prgrms-aibe-devcourse/AIBE6_FinalProject_Team01/deploy.yml?branch=dev&style=flat-square&label=build" />
  </p>

  <p>
    <b>2026.07 — 2026.08</b> | Backend & Frontend 3인 팀 프로젝트
  </p>

  <p>
    <a href="https://www.plamingo.site/"><img alt="Plamingo 서비스 바로가기" src="https://img.shields.io/badge/LIVE_SERVICE-F26B7A?style=for-the-badge&logo=googlechrome&logoColor=white" /></a>
    <a href="#-핵심-기능"><img alt="핵심 기능 보기" src="https://img.shields.io/badge/CORE_FEATURES-D94F70?style=for-the-badge&logo=readme&logoColor=white" /></a>
    <a href="https://github.com/prgrms-aibe-devcourse/AIBE6_FinalProject_Team01/issues/new"><img alt="버그 제보" src="https://img.shields.io/badge/REPORT_BUG-27384F?style=for-the-badge&logo=github&logoColor=white" /></a>
  </p>
</div>

---

## 목차

- [프로젝트 소개](#-프로젝트-소개)
- [핵심 기능](#-핵심-기능)
- [시스템 아키텍처](#-시스템-아키텍처)
- [도메인 맵](#-도메인-맵)
- [기술적 도전과 개선](#-기술적-도전과-개선)
- [기술 스택](#-기술-스택)
- [프로젝트 구조](#-프로젝트-구조)
- [시작하기](#-시작하기)
- [테스트와 모니터링](#-테스트와-모니터링)
- [API 문서](#-api-문서)
- [팀원](#-팀원)

## 🦩 프로젝트 소개

> 여행 멤버들이 공유한 장소를 한곳에 모으고, 투표와 날짜 조율로 의견을 좁힌 뒤, 관계, 거리, 다양성을 고려한 Day별 일정으로 완성하는 공동 여행지도 서비스입니다.

여행을 준비할 때 장소는 SNS와 지도 앱에서 찾고, 의견은 메신저에서 나누며, 일정은 다시 메모나 스프레드시트로 정리합니다. 정보가 여러 플랫폼에 흩어지면서 결정 과정은 길어지고, 정리 부담은 특정 구성원에게 집중됩니다.

**Plamingo**는 이 단절을 하나의 사용자 흐름으로 연결합니다.

```text
장소 탐색, 공유 → 분류, 투표 → 날짜 조율 → Day 배치, 동선 생성 → 경비 정산 → 여행 기록
```

### 우리가 해결하는 문제

| 기존 여행 준비                          | Plamingo                                         |
| --------------------------------------- | ------------------------------------------------ |
| 검색, 메신저, 메모, 지도 앱을 반복 이동 | 장소와 의견, 일정을 여행방 한곳에 축적           |
| 말이 많은 사람이 결정을 주도            | 투표와 가능한 날짜를 근거로 공동 결정            |
| 장소만 모이고 실제 동선은 수작업        | 관계, 거리, 다양성을 반영해 Day와 방문 순서 구성 |
| 여행이 끝나면 사진과 비용 맥락이 분리   | 일정 Day 기준으로 기록과 경비를 함께 보관        |

### 서비스 이용 흐름

| 단계                | 사용자 경험                                 | 구현 기능                                                                     |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| 1.&nbsp;시&#8288;작 | 계정을 만들고 여행방을 개설                 | 이메일 인증, Google, Kakao OAuth2, 여행 스타일, 동행 유형, 커버 이미지 설정   |
| 2.&nbsp;초&#8288;대 | 함께 갈 멤버를 여행방에 초대                | 초대 코드, 이메일 초대, 비회원 게스트 미리보기, 가입 후 초대 권한 연결        |
| 3.&nbsp;결&#8288;정 | 가능한 날짜와 후보 장소에 의견을 모음       | 멤버별 가능일 달력, 여행 기간 제안, 과반 확정, 장소 찬반, A/B 투표, 댓글      |
| 4.&nbsp;계&#8288;획 | 확정 장소를 Day별 일정과 실제 동선으로 구성 | 자동 분류, 드래그 앤 드롭, 칸반, 타임테이블, Routes 이동시간, AI 추천, 재계획 |
| 5.&nbsp;여&#8288;행 | 현장에서 일정과 비용, 기록을 함께 갱신      | 접속 현황, 실시간 동기화, 지출 분담, 정산 완료, Day별 사진, 메모              |
| 6.&nbsp;공&#8288;유 | 여행을 회고하고 다른 여행자와 경험을 나눔   | 개인 회고, 공개 범위 설정, 여행 카드 탐색, 댓글, 북마크, 일정 복사            |

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## ✨ 핵심 기능

<p align="center">
  <img width="100%" alt="Plamingo 핵심 기능 4종: 장소 검색, 투표, Day 동선, 경비 정산" src="docs/images/core-features-grid.png" />
</p>

### 구현 기능 한눈에 보기

| 영역          | 주요 기능                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------ |
| 여행방        | 생성, 수정, 삭제, 나가기, 여행 상태 관리, 커버 이미지, 프리셋, 공개 범위와 완료 확인             |
| 멤버 협업     | 초대 코드, 이메일 초대, 게스트 접근, 역할별 권한, 접속 위치, 작업 영역 공유, 활동 로그와 알림    |
| 날짜 결정     | 멤버별 가능한 날짜 저장, 겹치는 날짜 확인, 여행 기간 제안, 찬반 투표와 과반수 자동 확정          |
| 장소 관리     | Google Places 검색, 상세, 사진, 카테고리 자동 분류, 지도 핀, 장소 댓글, 찬반, A/B 투표           |
| 일정, 동선    | Day 초기화, 일정 추가, 수정, 삭제, 이동, 정렬, 출발지, 시간, 이동수단 설정, 경로 미리보기, 적용  |
| AI 지원       | 여행 조건 기반 장소 후보 추천, 전체 또는 특정 Day 재계획, OpenAI 장애 시 규칙 기반 폴백          |
| 여행 중, 이후 | 동일 분담, 직접 분담 지출, 참여자별 정산 상태, 사진 업로드, Day별 기록과 개인 회고               |
| 여행 탐색     | 공개 일정, 기록 검색, 최신, 인기, 댓글순 정렬, 스타일 필터, 댓글, 북마크, 여행방 공유, 일정 복사 |
| 계정, 보안    | 이메일 가입, 비밀번호 재설정, OAuth2, JWT 재발급, 로그아웃, 프로필, 로그인 제한, 회원 탈퇴       |
| 관리자, 문의  | 운영 대시보드, 회원 정지, 부관리자 관리, 문의 답변, 외부 API 사용량, 커버 프리셋, 감사 로그      |

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## 🏗 시스템 아키텍처

<p align="center">
  <img
    width="100%"
    alt="Plamingo 시스템 아키텍처"
    src="docs/images/plamingo-system-architecture.png"
  />
</p>

### 구성 및 요청 흐름

1. 사용자는 Vercel에 배포된 Next.js 화면에 접근하며, SSR/ISR 응답과 클라이언트 화면을 전달받습니다.
2. 프론트엔드의 API 요청은 AWS EC2의 Nginx Proxy Manager를 거쳐 현재 활성화된 Spring Boot Blue/Green 슬롯으로 전달됩니다. 실시간 협업 이벤트도 같은 진입점을 통해 STOMP WebSocket으로 송수신합니다.
3. Spring Boot는 MySQL에 여행방, 일정, 정산, 기록을 영속화하고 Redis에서 Refresh Token, OTP, 로그인 제한, 캐시와 외부 API 호출량을 관리합니다. 업로드한 사진과 객체 파일은 Amazon S3에 저장합니다.
4. 서버는 OpenAI, Google Maps, Google/Kakao OAuth, Brevo SMTP와 연동합니다. 외부 API 요청에는 타임아웃, 장애 폴백과 사용량 추적을 적용합니다.
5. GitHub에 코드가 반영되면 GitHub Actions가 프론트엔드를 Vercel에 배포합니다. 백엔드는 Docker 이미지를 빌드한 뒤 AWS SSM으로 배포 명령을 전달하고, 헬스체크를 통과한 새 Blue/Green 슬롯으로 트래픽을 전환합니다.
6. 별도 Load Testing Tier의 k6가 Nginx 진입점에 실제 사용자 흐름 기반 부하를 발생시킵니다. 테스트 프로필에서는 유료 외부 API를 Mock 처리해 과금과 데이터 오염을 방지합니다.
7. Spring Boot와 k6 지표는 Prometheus에, 애플리케이션 및 Access Log는 Alloy를 통해 Loki에 수집합니다. Grafana는 두 저장소를 조회해 요청 지연, 오류, 시스템 자원과 로그를 같은 시간축으로 분석합니다.

> [!IMPORTANT]
> 아키텍처의 Load Testing Tier와 Observability Tier는 일반 사용자 요청 경로와 분리된 성능 검증 환경입니다. 현재 저장소에는 **k6 + Prometheus + Grafana + Loki + Alloy** 구성이 구현되어 있으며, 운영 적용 시에는 인증, TLS, 영구 스토리지와 별도의 로그 보존 정책이 필요합니다.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## 🗺️ 도메인 맵

<p align="center">
  <img
    width="100%"
    alt="Plamingo 도메인맵"
    src="docs/images/plamingo-domain-map.png"
  />
</p>

Plamingo는 여행방을 중심으로 장소 의사결정, 일정과 동선, 정산, 여행 기록, 공개 카드가 연결됩니다. AI 추천은 검색된 장소 후보와 여행방 정보를 바탕으로 추천 및 재계획 미리보기를 제공하며, 활동 로그, 알림과 STOMP 갱신은 공통 협업 영역에서 지원합니다.

- **인증, 회원 (`auth`, `member`)**: 이메일, OAuth2 로그인, JWT 수명주기, 프로필, 계정 상태와 개인정보 파기
- **여행방 (`trip`)**: 여행 생성부터 멤버, 게스트 초대, 날짜 조율, 상태, 공개 범위, 완료 처리까지 관리하는 중심 도메인
- **장소 (`place`)**: Places 검색, 여행방 장소, 카테고리, 지도 핀, 댓글, 투표와 장소 관계 점수 관리
- **일정 (`itinerary`)**: Day와 일정 항목, 이동수단, 시간, 순서 변경, 경로 계산과 배치 알고리즘 관리
- **AI 지원 (`agent`)**: 장소 추천과 일정 재계획을 미리보기로 제공하고 사용자가 승인한 결과만 반영
- **협업 (`collaboration`)**: 도메인 변경을 활동 로그, 알림으로 남기고 STOMP 이벤트로 실시간 전달
- **정산, 기록 (`expense`, `travelrecord`)**: 지출 참여자별 분담, 완료 상태와 Day별 사진, 메모, 개인 회고 관리
- **공개 카드 (`card`)**: 완료된 여행의 공개, 검색, 댓글, 북마크, 공유와 다른 여행방으로 일정 복사
- **운영 (`admin`, `inquiry`)**: 회원, 문의, 외부 API 사용량, 커버 이미지 관리와 모든 관리자 조치 감사 기록

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## 🧩 기술적 도전과 개선

### 1. 검색 증강(RAG) 패턴으로 생성 범위를 제한한 장소 추천

장소 추천에서 LLM이 검색되지 않은 장소를 추가하지 못하도록 **Google Places 검색 결과와 여행방 컨텍스트를 결합한 검색 증강 구조**를 적용했습니다. 벡터 DB와 임베딩을 사용하는 문서 RAG는 아닙니다.

```text
사용자 조건과 선택한 경로 구간
→ Google Places에서 주변 후보 검색
→ 등록된 장소와 카테고리 불일치 후보 제외
→ 우회 거리와 여행 스타일 적합도 계산
→ 검색된 후보만 OpenAI가 재정렬
→ 서버 점수와 결합해 추천 이유와 함께 반환
```

OpenAI에는 후보의 Place ID, 이름, 주소, 카테고리, Google 유형, 평점과 리뷰 수만 전달합니다. Structured Output으로 응답 형식을 제한하고 검색 후보에 없는 Place ID는 서버에서 제외합니다. OpenAI 호출이 실패하면 우회 거리와 여행 스타일 적합도 기반 점수로 추천을 계속합니다.

### 2. 관계와 제약조건을 반영한 Day 배치

거리만으로 장소를 묶지 않고 `ItineraryRoutePlanner`가 관계도, 지리적 근접도, 카테고리 다양성과 Day별 배치량을 함께 계산합니다.

```text
장소 관계 점수 = 스타일 벡터 코사인 유사도 × 0.7
               + log(1 + 공동 방문 횟수) × 0.15

Day 배치 점수 = 관계도 × 0.55
              + 지리적 근접도 × 0.25
              + 카테고리 다양성 × 0.55
              - Day 배치량 × 0.10
```

관계 기반 클러스터를 만든 뒤 최근접 이웃 순서로 정렬하며, 출발지, 체류시간, 식사시간, 일별 시작·종료 시각과 이동시간을 일정 생성에 반영합니다. OpenAI가 전체 일정을 직접 저장하지 않고 서버가 만든 미리보기를 사용자가 선택해 적용합니다.

### 3. Google Maps 호출 구조 최적화

Places 콘텐츠를 무기한 저장해 재사용하는 방식 대신, 요청이 발생하는 시점과 범위를 줄였습니다.

- 여행방 장소 검색에 `700ms` debounce, `AbortController`와 요청 ID 검증 적용
- 여행지 자동완성에 `400ms` debounce와 Autocomplete Session Token 적용
- Places, Routes 요청에서 필요한 필드만 `X-Goog-FieldMask`로 지정
- 일정 항목 추가 시 삽입 위치 전후의 연결 구간만 Routes API 재계산
- Redis의 1분 단위 카운터로 Places와 Routes 호출 한도 관리
- 외부 API 제공자, 작업 종류, 성공 여부와 OpenAI 토큰 사용량 기록

### 4. DB 트랜잭션과 이동시간 계산 분리

일정 항목을 추가할 때 여행방 쓰기 락을 획득한 트랜잭션 안에서 Google Places와 Routes를 호출하면, 외부 API 지연 시간만큼 같은 여행방의 요청과 DB 커넥션이 대기할 수 있습니다.

```text
일정 항목과 순서 저장
→ 트랜잭션 커밋
→ AFTER_COMMIT 이벤트 처리
→ 변경된 연결 구간의 이동시간 계산
→ 현재 일정 구조가 같을 때만 계산 결과 저장
```

`ItineraryTravelRecalculationListener`는 커밋 이후 필요한 구간만 계산합니다. 결과를 저장하기 전에 항목 ID와 앞뒤 장소가 요청 당시와 같은지 다시 검증하며, 외부 API 호출이 실패해도 이미 저장된 일정 변경은 되돌리지 않습니다.

### 5. k6 태그와 관제 지표를 이용한 병목 추적

`performance/`에 Smoke, Load, Spike, Stress, Soak, WebSocket 및 실제 사용자 흐름 시나리오를 구성했습니다.

- `dashboard`, `trip_room`, `write` flow와 endpoint 태그로 느린 API를 단계적으로 추적
- 최대 1,000 VU까지 증가시키며 p95/p99, 실패율과 WebSocket 연결시간 측정
- HikariCP active/pending, Tomcat thread, CPU, GC 지표를 같은 시간축으로 비교
- 애플리케이션, Access Log를 Alloy로 수집하고 Loki에서 API 오류와 병목 시점 추적
- Access Log에서는 쿼리 문자열을 제외해 토큰, 검색어 등 민감정보 노출 방지
- `performance` 프로필에서는 Google Maps, OpenAI, Brevo, S3 호출을 차단해 테스트 과금 방지

#### 1,000 VU Before / After

<table>
  <tr>
    <th width="50%">Before</th>
    <th width="50%">After</th>
  </tr>
  <tr>
    <td><img width="100%" alt="1,000 VU 부하 테스트 개선 전" src="docs/images/performance/load-test-before.png" /></td>
    <td><img width="100%" alt="1,000 VU 부하 테스트 개선 후" src="docs/images/performance/load-test-after.png" /></td>
  </tr>
</table>

| 핵심 지표            | Before          | After     | 개선             |
| -------------------- | --------------: | --------: | ---------------: |
| 전체 p95             |          64.4ms |    37.0ms |            42.6% |
| Hikari Pending 최대  |             189 |        34 |            82.0% |
| Connection 점유 최대 | 22,800ms (22.8초) |     205ms |             99.1% |
| Pool 포화 시작       |       약 393 VU | 약 734 VU | +341 VU (86.8%) |

HikariCP 조정과 쿼리 구조 및 인덱스 개선을 함께 적용해 처리량을 약 310 req/s로 유지하면서 DB 커넥션 대기와 응답 지연을 줄였습니다.

> 위 수치는 여러 개선을 함께 적용한 종합 효과이며, 각 변경의 단독 효과를 의미하지 않습니다.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## 🧰 기술 스택

<p align="center">
  <img
    alt="Plamingo 주요 기술 스택"
    src="https://skillicons.dev/icons?i=nextjs,react,ts,tailwind,java,spring,mysql,redis,docker,aws,terraform,grafana&perline=12"
  />
</p>

<p align="center"><sub>아래 표에서 실제 적용 버전과 관제, 외부 연동 기술을 확인할 수 있습니다.</sub></p>

| 영역               | 기술                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend           | ![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white) ![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript_6-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Tailwind](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![Zustand](https://img.shields.io/badge/Zustand-443E38?style=flat-square)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Backend            | ![Java](https://img.shields.io/badge/Java_21-ED8B00?style=flat-square&logo=openjdk&logoColor=white) ![Spring Boot](https://img.shields.io/badge/Spring_Boot_4.1-6DB33F?style=flat-square&logo=springboot&logoColor=white) ![Spring Security](https://img.shields.io/badge/Spring_Security-6DB33F?style=flat-square&logo=springsecurity&logoColor=white) ![JPA](https://img.shields.io/badge/Spring_Data_JPA-6DB33F?style=flat-square) ![WebSocket](https://img.shields.io/badge/STOMP_WebSocket-010101?style=flat-square)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Data & Storage     | ![MySQL](https://img.shields.io/badge/MySQL_8.4-4479A1?style=flat-square&logo=mysql&logoColor=white) ![Redis](https://img.shields.io/badge/Redis_7.4-DC382D?style=flat-square&logo=redis&logoColor=white) ![Flyway](https://img.shields.io/badge/Flyway-CC0200?style=flat-square&logo=flyway&logoColor=white) ![S3](https://img.shields.io/badge/Amazon_S3-569A31?style=flat-square&logo=amazons3&logoColor=white)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| External API       | ![Google Maps](https://img.shields.io/badge/Google_Places_&_Routes-4285F4?style=flat-square&logo=googlemaps&logoColor=white) ![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white) ![Brevo](https://img.shields.io/badge/Brevo_SMTP-0B996E?style=flat-square)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Infra & Monitoring | ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white) ![Terraform](https://img.shields.io/badge/Terraform-7B42BC?style=flat-square&logo=terraform&logoColor=white) ![AWS](https://img.shields.io/badge/AWS_EC2-FF9900?style=flat-square&logo=amazonec2&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white) ![k6](https://img.shields.io/badge/k6-7D64FF?style=flat-square&logo=k6&logoColor=white) ![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=flat-square&logo=prometheus&logoColor=white) ![Grafana](https://img.shields.io/badge/Grafana-F46800?style=flat-square&logo=grafana&logoColor=white) ![Loki](https://img.shields.io/badge/Loki-F5A800?style=flat-square&logo=grafana&logoColor=white) ![Alloy](https://img.shields.io/badge/Grafana_Alloy-F46800?style=flat-square&logo=grafana&logoColor=white) |

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## 📁 프로젝트 구조

백엔드는 IntelliJ IDEA, 프론트엔드는 VS Code로 개발한 실제 작업 환경 그대로 구조를 정리했습니다.

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <sub><b>Backend | IntelliJ IDEA</b></sub><br/><br/>
      <img width="100%" alt="백엔드 프로젝트 구조 (IntelliJ IDEA 프로젝트 패널)" src="docs/images/project-structure-backend-intellij.png" />
    </td>
    <td align="center" valign="top" width="50%">
      <sub><b>Frontend | VS Code</b></sub><br/><br/>
      <img width="100%" alt="프론트엔드 프로젝트 구조 (VS Code 탐색기 패널)" src="docs/images/project-structure-frontend-vscode.png" />
    </td>
  </tr>
</table>

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## 🚀 시작하기

### 요구사항

- Java 21
- Node.js 20.9 이상
- Docker 및 Docker Compose

### 1. 저장소 복제

```bash
git clone https://github.com/prgrms-aibe-devcourse/AIBE6_FinalProject_Team01.git
cd AIBE6_FinalProject_Team01
```

### 2. 백엔드 환경변수 설정

`backend/.env`에 로컬 인프라와 애플리케이션 환경변수를 설정합니다. 실제 비밀값은 커밋하지 않습니다.

```env
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_ROOT_PASSWORD=
REDIS_PASSWORD=
JWT_SECRET=
GRAFANA_ADMIN_PASSWORD=

# 선택 연동
GOOGLE_MAPS_API_KEY=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
BREVO_SMTP_USERNAME=
BREVO_SMTP_PASSWORD=
```

> 정확한 변수명과 선택 설정은 `backend/src/main/resources/application-*.yml` 및 기존 환경 설정 문서를 확인해주세요.

### 3. 인프라와 백엔드 실행

```bash
cd backend
docker compose up -d
./gradlew bootRun                  # macOS / Linux
# gradlew.bat bootRun              # Windows
```

기본 로컬 프로필은 OAuth 키 없이 실행할 수 있습니다. 소셜 로그인이 필요하면 OAuth 환경변수를 설정하고 프로필을 추가합니다.

```bash
./gradlew bootRun --args='--spring.profiles.active=local,oauth'
```

### 4. 프론트엔드 실행

```bash
cd ../frontend
npm install
npm run dev
```

| 서비스     | 주소                                  |
| ---------- | ------------------------------------- |
| Frontend   | http://localhost:3000                 |
| Backend    | http://localhost:8080                 |
| Swagger UI | http://localhost:8080/swagger-ui.html |
| Prometheus | http://localhost:9090                 |
| Grafana    | http://localhost:3001                 |

> [!CAUTION]
> `docker compose down -v`는 MySQL, Redis, 모니터링 볼륨을 삭제합니다. 데이터 초기화가 필요한 경우에만 사용하세요.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## 🧪 테스트와 모니터링

### 자동화 검증

```bash
# Backend
cd backend
./gradlew test
./gradlew clean build

# Frontend
cd ../frontend
npm run lint
npm run type-check
npm test
npm run build
```

- Backend: JUnit 5, AssertJ, Spring MVC/Security/JPA 통합 테스트 **800+**
- Frontend: Node Test Runner 기반 테스트 **77개**

### 로컬 성능 테스트

```bash
# 프로젝트 루트에서 모니터링 실행
./performance/start-monitoring.sh

# 백엔드는 과금 방지용 performance 프로필로 실행
cd backend
SPRING_PROFILES_ACTIVE=local,performance ./gradlew bootRun
```

자세한 k6 시나리오와 Grafana 사용법은 [`performance/README.md`](performance/README.md)를 참고하세요.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

## 📖 API 문서

백엔드 실행 후 확인할 수 있습니다.

- Swagger UI: http://localhost:8080/swagger-ui.html
- OpenAPI JSON: http://localhost:8080/v3/api-docs
- Flyway 규칙: [`backend/src/main/resources/db/migration/README.md`](backend/src/main/resources/db/migration/README.md)

## 👥 팀원

<table align="center">
  <tr>
    <td align="center" width="240">
      <a href="https://github.com/JuyoungKim1024">
        <img width="120" alt="JuyoungKim1024 프로필" src="https://github.com/JuyoungKim1024.png?size=120" />
      </a><br/>
      <b><a href="https://github.com/JuyoungKim1024">@JuyoungKim1024</a></b><br/>
      <sub><b>Team Leader</b> / Backend / Frontend</sub><br/>
      <sub>AI 추천, 실시간 협업, 관리자, 보안, 성능 최적화</sub>
    </td>
    <td align="center" width="240">
      <a href="https://github.com/HeungJunBag">
        <img width="120" alt="HeungJunBag 프로필" src="https://github.com/HeungJunBag.png?size=120" />
      </a><br/>
      <b><a href="https://github.com/HeungJunBag">@HeungJunBag</a></b><br/>
      <sub>Backend / Frontend</sub><br/>
      <sub>일정, 동선 알고리즘, Google Maps, 장소 지도</sub>
    </td>
    <td align="center" width="240">
      <a href="https://github.com/0-0v">
        <img width="120" alt="0-0v 프로필" src="https://github.com/0-0v.png?size=120" />
      </a><br/>
      <b><a href="https://github.com/0-0v">@0-0v</a></b><br/>
      <sub>Backend / Frontend</sub><br/>
      <sub>인증, 회원, 초대, 여행 기록, 정산, 공개 서비스</sub>
    </td>
  </tr>
</table>

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

---

<div align="center">
  <img width="120" alt="여행을 시작하는 플라밍고" src="frontend/public/assets/plamingo2-cta-v2.png" />
  <br/>
  <b>여행의 시작부터 기록까지, 함께 완성하는 Plamingo</b>
</div>

<img width="100%" alt="Plamingo footer" src="https://capsule-render.vercel.app/api?type=waving&color=F26B7A&height=150&section=footer" />
