# Plamingo 부하 테스트 전체 실행 가이드

이 문서는 새 개발 환경에서 도구를 준비하고, 로컬 모니터링 환경을 실행하고,
1,000명 HTTP 부하를 발생시킨 뒤 Grafana·Loki·MySQL 자료를 근거로 병목을
판정하는 전 과정을 설명한다.

> 이 구성은 로컬 또는 격리된 성능 테스트 환경 전용이다. 운영 서버, 운영 DB,
> 공유 개발 DB에 부하를 발생시키지 않는다.

## 1. 테스트 목적과 범위

이번 구성은 다음 질문에 답하기 위한 것이다.

1. 동시 사용자가 증가해도 정상 응답 비율을 유지하는가?
2. 대시보드, 여행방 조회, 쓰기 API의 p95·p99는 목표 안에 있는가?
3. 느려지는 시점에 CPU, GC, Tomcat 스레드, DB 커넥션 중 무엇이 포화되는가?
4. HTTP 실패와 같은 시각에 서버 ERROR 또는 5xx 액세스 로그가 있는가?

테스트에서는 다음 외부 연동을 호출하지 않는다.

- Google Maps Platform
- OpenAI
- Brevo
- S3

`performance` 프로필이 외부 API를 기본 차단한다. 따라서 테스트 트래픽으로
외부 API 비용이 발생하지 않아야 한다.

## 2. 전체 구조

```text
k6 컨테이너
 ├─ HTTP 요청 ───────────────────────────→ Spring Boot :8080
 └─ k6 메트릭 ── Remote Write ──────────→ Prometheus :9090

Spring Boot
 ├─ /actuator/prometheus ───────────────→ Prometheus
 ├─ build/performance-logs/backend.log ─┐
 └─ build/performance-logs/access*.log ─┴→ Alloy → Loki :3100

Prometheus + Loki ──────────────────────→ Grafana :3001
```

각 도구의 역할은 다음과 같다.

| 도구 | 역할 |
|---|---|
| k6 | 가상 사용자를 생성하고 요청 수, 실패율, 응답시간을 측정 |
| Spring Boot Actuator | HTTP, HikariCP, Tomcat, JVM 지표 노출 |
| Prometheus | 지표를 5초마다 수집하고 k6 Remote Write 저장 |
| Alloy | 백엔드·액세스 로그 파일을 읽어 Loki로 전송 |
| Loki | 로그 저장 및 LogQL 검색 |
| Grafana | Prometheus 지표와 Loki 로그 시각화 |
| MySQL Performance Schema | SQL 호출 횟수, 누적시간, 검사 행 수 집계 |

## 3. 관련 파일

| 파일 | 역할 |
|---|---|
| `backend/compose.yml` | MySQL, Redis, Prometheus, Loki, Alloy, Grafana 실행 |
| `backend/src/main/resources/application-performance.yml` | 테스트 데이터, 외부 API 차단, 메트릭·로그 설정 |
| `performance/compose.yml` | k6 실행 설정 |
| `performance/start-monitoring.sh` | macOS/Linux 모니터링 시작 |
| `performance/start-monitoring.ps1` | Windows 모니터링 시작 |
| `performance/k6/smoke.js` | 1명 기능·연결 검증 |
| `performance/k6/load.js` | 20→50명 기본 부하 |
| `performance/k6/realistic-load.js` | 최대 1,000명 실서비스형 혼합 부하 |
| `performance/prometheus/prometheus.yml` | 백엔드 스크레이프 및 Remote Write 수신 |
| `performance/alloy/config.alloy` | 백엔드·액세스 로그 수집 |
| `performance/loki/loki-config.yml` | 단일 노드 Loki 및 7일 보관 |
| `performance/grafana/dashboards/plamingo-backend.json` | 병목 분석 대시보드 |
| `performance/LOKI_GUIDE.md` | Loki 상세 조회 가이드 |
| `performance/PERFORMANCE_BOTTLENECK_GUIDE.md` | 병목 판정 및 SQL 분석 가이드 |

## 4. 사전 준비

### 4.1 필수 도구

- Docker Desktop
- Java 21
- Git
- curl
- macOS/Linux는 Bash, Windows는 PowerShell

설치를 확인한다.

```bash
docker --version
docker compose version
java -version
curl --version
```

`java -version`은 21이어야 하고 Docker Desktop은 실행 중이어야 한다.

### 4.2 저장 공간과 포트

다음 포트가 사용 가능한지 확인한다.

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
lsof -nP -iTCP:9090 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:3100 -sTCP:LISTEN
lsof -nP -iTCP:12345 -sTCP:LISTEN
```

| 포트 | 서비스 |
|---:|---|
| 8080 | Spring Boot |
| 9090 | Prometheus |
| 3001 | Grafana |
| 3100 | Loki |
| 12345 | Alloy UI |

### 4.3 환경변수

`backend/.env`에 로컬 실행에 필요한 MySQL, Redis, JWT 설정과 다음 Grafana
값을 둔다. 실제 `.env`는 커밋하지 않는다.

```env
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=
GRAFANA_PORT=3001
```

성능 테스트 계정 기본값은 다음과 같다.

```text
Smoke 계정: test-user-1@plamingo.app
Smoke 비밀번호: PlamingoTest1!
대규모 계정: performance-user-0001@plamingo.app ~ performance-user-1000@plamingo.app
대규모 비밀번호: PlamingoLoad1!
```

모두 performance 프로필에서만 사용하는 테스트 데이터다.

## 5. 모니터링 환경 설치 및 실행

프로젝트 루트에서 실행한다.

### macOS/Linux

```bash
chmod +x performance/start-monitoring.sh
./performance/start-monitoring.sh
```

### Windows PowerShell

```powershell
.\performance\start-monitoring.ps1
```

최초 실행 시 Docker가 이미지를 내려받기 때문에 시간이 걸릴 수 있다. 이후에는
MySQL, Redis, Prometheus, Loki, Alloy, Grafana 컨테이너가 실행된다.

정상 상태를 확인한다.

```bash
docker compose -f backend/compose.yml ps
curl --fail http://localhost:9090/-/ready
curl --fail http://localhost:3100/ready
curl --fail http://localhost:12345/-/ready
curl --fail http://localhost:3001/api/health
```

컨테이너 이름은 다음과 같다.

```text
plamingo-mysql
plamingo-redis
plamingo-prometheus
plamingo-loki
plamingo-alloy
plamingo-grafana
```

## 6. 백엔드 실행

백엔드를 완전히 종료한 상태에서 새 터미널로 실행한다. Tomcat MBean 설정은
완전 재시작해야 적용된다.

```bash
cd backend
SPRING_PROFILES_ACTIVE=local,performance ./gradlew bootRun
```

시드 데이터 개수를 바꾸려면 실행 전에 지정한다.

```bash
export PERFORMANCE_MEMBER_COUNT=1000
export PERFORMANCE_MEMBERS_PER_TRIP=10
SPRING_PROFILES_ACTIVE=local,performance ./gradlew bootRun
```

기동 후 확인한다.

```bash
curl --fail http://localhost:8080/actuator/health
curl --fail http://localhost:8080/actuator/prometheus | head
```

Prometheus에서 다음 결과가 `1`인지 확인한다.

```promql
up{job="plamingo-backend"}
```

### 6.1 외부 API 차단 검증

```bash
curl -i 'http://localhost:8080/api/places/search?query=osaka'
```

`503 Service Unavailable`이면 의도한 차단이다. 이 요청은 본 부하 테스트의 서버
장애로 계산하지 않는다. `PERFORMANCE_ALLOW_EXTERNAL_APIS=true`는 별도 비용·쿼터를
준비한 통합 테스트가 아니면 설정하지 않는다.

## 7. 로그 수집 사전 검증

로그 파일을 확인한다.

```bash
find backend/build/performance-logs -maxdepth 1 -type f -print
tail -n 20 backend/build/performance-logs/backend.log
tail -n 20 backend/build/performance-logs/access*.log
```

Alloy가 파일을 볼 수 있는지 확인한다.

```bash
docker exec plamingo-alloy sh -c 'ls -lh /var/log/plamingo'
```

Grafana에서 다음 경로로 이동한다.

```text
Explore → Loki → Last 15 minutes
```

각 쿼리에서 결과가 나오는지 확인한다.

```logql
{job="plamingo-backend"}
```

```logql
{job="plamingo-access"}
```

Alloy나 Loki에 지속적인 전송 오류가 있으면 테스트 전에 해결한다.

```bash
docker compose -f backend/compose.yml logs --tail=100 alloy
docker compose -f backend/compose.yml logs --tail=100 loki
```

## 8. Smoke 테스트

대규모 테스트 전에 반드시 1명 Smoke 테스트를 통과시킨다.

```bash
export TEST_PASSWORD='PlamingoTest1!'
export EXPECT_EXTERNAL_GUARD=true

docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/smoke.js
```

확인 항목:

- 로그인 및 토큰 발급
- 백엔드 health
- 여행방 목록
- 외부 API 차단
- k6 결과의 Prometheus 저장

첫 실행은 JVM 워밍업, 클래스 로딩, DB 커넥션 생성 때문에 느릴 수 있다. 기능 실패가
없다면 한 번 더 실행하고 두 번째 결과를 기준으로 기본 연결 성능을 확인한다.

이번 워밍 Smoke 결과:

```text
검사: 5/5 성공
실패율: 0%
평균: 41.4ms
p95: 120.54ms
최대: 137.49ms
```

## 9. 기본 Load 테스트

Smoke 성공 후 20→50명 부하로 구성 자체를 먼저 검증한다.

```bash
export TEST_PASSWORD='PlamingoLoad1!'

docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/load.js
```

이번 결과:

```text
시간: 5분 30초
반복: 10,054건
HTTP 요청: 40,217건
검사 성공률: 100%
HTTP 실패: 0건
평균: 37.75ms
p95: 105.53ms
최대: 1.15초
처리량: 121.60 req/s
```

이 단계가 실패하면 1,000명 테스트를 실행하지 않고 로그인, 시드 데이터, 네트워크,
Prometheus와 로그 수집 설정부터 고친다.

## 10. 실서비스형 1,000명 테스트

### 10.1 사용자 행동

- 각 VU가 서로 다른 계정으로 로그인
- 30% 확률로 여행방 목록과 알림 정보 조회
- 70% 확률로 여행방 멤버와 일정 조회
- 30초마다 presence 갱신
- 일부 사용자가 알림 전체 읽음 수행
- 행동 사이 2~8초 대기

### 10.2 부하 단계

| 구간 | 시간 | 목표 VU |
|---|---:|---:|
| Ramp 1 | 3분 | 100 |
| Ramp 2 | 3분 | 300 |
| Ramp 3 | 3분 | 500 |
| Ramp 4 | 3분 | 750 |
| Ramp 5 | 3분 | 1,000 |
| Hold | 10분 | 1,000 |
| Ramp down | 5분 | 0 |

총 실행시간은 약 30분이다.

### 10.3 실행

```bash
export TEST_PASSWORD='PlamingoLoad1!'
export PERFORMANCE_MEMBER_COUNT=1000

docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/realistic-load.js
```

Windows:

```powershell
$env:TEST_PASSWORD='PlamingoLoad1!'
$env:PERFORMANCE_MEMBER_COUNT='1000'
.\performance\run-test.ps1 -Scenario realistic-load -PrometheusOutput
```

### 10.4 실행 중 확인

Grafana `Dashboards → Plamingo → Plamingo Backend`에서 다음 그래프를 같은
시간축으로 본다.

1. 초당 요청 수
2. 전체 및 URI별 p95·p99
3. 5xx 오류율
4. Hikari active, idle, max, pending
5. 커넥션 획득·점유시간 및 timeout
6. Tomcat busy/current/max
7. 프로세스·시스템 CPU
8. JVM 힙과 GC 정지시간

테스트 도중 단지 느려졌다는 이유로 중단하지 않는다. 다만 다음 상황이면 서버와
데이터를 보호하기 위해 중단을 검토한다.

- 지속적인 5xx 급증
- DB 연결 실패가 계속 증가
- OutOfMemoryError
- 호스트가 응답하지 않을 정도의 자원 고갈
- 운영 또는 외부 API로 잘못 요청하고 있음을 발견

`ramp-down` 중 `interrupted iterations`는 목표 VU를 줄이며 진행 중 반복을 종료한
수치일 수 있다. 실제 장애 여부는 `http_req_failed`와 flow failure를 기준으로 본다.

## 11. 합격 기준

`realistic-load.js`의 기본 기준은 다음과 같다.

| 흐름 | p95 | p99 |
|---|---:|---:|
| 대시보드 | 500ms 미만 | 1초 미만 |
| 여행방 | 700ms 미만 | 1.5초 미만 |
| 쓰기 | 1초 미만 | 2초 미만 |

공통 기준:

- HTTP 실패율 1% 미만
- flow 실패율 1% 미만
- 예상하지 않은 서버 5xx 0건
- Hikari pending이 정상 부하에서 지속적으로 0
- Tomcat 스레드 사용률이 장시간 80% 미만

k6가 종료 코드 `99`를 반환하면 하나 이상의 threshold가 실패한 것이다. 기능 성공률이
높아도 응답시간 threshold가 실패하면 성능 테스트는 실패다.

## 12. 이번 1,000명 테스트 결과

테스트 시간: 2026-08-18 16:04~16:34 KST

### 12.1 k6 결과

| 지표 | 결과 |
|---|---:|
| 최대 VU | 1,000 |
| HTTP 요청 | 155,021건 |
| 평균 처리량 | 85.89 req/s |
| 완료 반복 | 54,531건 |
| HTTP 실패 | 20건, 0.01% |
| flow 실패 | 13건, 0.01% |
| 검사 성공률 | 99.96% |
| 전체 평균 | 9.53초 |
| 전체 p95 | 26.63초 |
| 대시보드 p95 | 24.86초 |
| 여행방 p95 | 26.05초 |
| 쓰기 p95 | 29.83초 |

오류율 기준은 통과했지만 세 흐름의 응답시간 기준이 모두 실패했다.

### 12.2 서버와 로그

- 본 테스트 시간대 액세스 로그의 서버 5xx: 0건
- `Broken pipe`: 1건
- Loki에서 백엔드 ERROR 조회: 1건
- Loki에서 테스트 시간대 5xx 조회: 0건
- Loki/Alloy 로그 수집: 정상
- Loki 단일 노드 내부 rate 조회 timeout: 4건

외부 API 차단 확인용 503 두 건은 본 테스트 시작 전 요청이다.

### 12.3 병목 지표

| 지표 | 최대값 | 해석 |
|---|---:|---|
| Hikari max | 10 | 풀 상한 |
| Hikari active | 10 | 모든 커넥션 점유 |
| Hikari pending | 190 | 커넥션 대기 심화 |
| 커넥션 획득 | 9.078초 | 풀 대기 병목 |
| 커넥션 점유 | 1.706초 | 느린 SQL·긴 트랜잭션 후보 |
| 애플리케이션 CPU | 약 19% | 첫 번째 병목으로 보기 어려움 |
| 시스템 CPU | 약 92% | 동일 호스트 통합 실행 영향 가능 |
| GC 최대 정지 | 130ms | 첫 번째 병목으로 보기 어려움 |
| 40분 GC 누적 정지 | 약 7.94초 | 추가 관찰 필요 |

현재 증거는 Hikari 커넥션 풀 포화를 첫 번째 병목 후보로 가리킨다. 하지만 풀 크기를
바로 크게 올리지 않고 SQL 호출 횟수, N+1, 인덱스, 트랜잭션 점유시간을 먼저 조사한다.

## 13. Loki에서 실패 요청 대조

Grafana 시간 범위를 테스트 시작·종료 시각으로 고정한다.

백엔드 ERROR:

```logql
{job="plamingo-backend"} |= " ERROR "
```

HTTP 5xx:

```logql
{job="plamingo-access"} |~ "status=5[0-9]{2}"
```

DB 및 커넥션 오류:

```logql
{job="plamingo-backend"}
  |~ "(?i)hikari|connection.*timeout|sql.*exception|deadlock"
```

특정 API:

```logql
{job="plamingo-access"} |= "path=/api/trips"
```

Prometheus에서 지연이 시작된 시각을 찾고, 같은 시각의 Loki 로그를 확인해야 한다.

## 14. 느린 SQL 조사

먼저 테스트 DB에서 Performance Schema 활성화 상태를 확인한다.

```sql
SHOW VARIABLES LIKE 'performance_schema';
```

공유 DB가 아닌 성능 테스트 전용 DB라면 테스트 직전에 누적 통계를 초기화할 수 있다.

```sql
TRUNCATE TABLE performance_schema.events_statements_summary_by_digest;
```

테스트 후 누적시간이 큰 SQL을 조회한다.

```sql
SELECT
    DIGEST_TEXT,
    COUNT_STAR,
    ROUND(SUM_TIMER_WAIT / 1000000000000, 3) AS total_seconds,
    ROUND(AVG_TIMER_WAIT / 1000000000000, 6) AS avg_seconds,
    SUM_ROWS_EXAMINED,
    SUM_ROWS_SENT
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME = 'plamingo'
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 20;
```

다음 순서로 문제를 찾는다.

1. `COUNT_STAR`가 과도한 SQL: 중복 조회 또는 N+1 후보
2. `SUM_ROWS_EXAMINED`가 반환량보다 큰 SQL: 인덱스 후보
3. `AVG_TIMER_WAIT`가 큰 SQL: 쿼리·락·정렬 후보
4. `SUM_TIMER_WAIT`가 큰 SQL: 전체 부하 기여도가 큰 우선 개선 대상

문제 SQL은 테스트 DB에서 다음으로 실행 계획을 확인한다.

```sql
EXPLAIN ANALYZE
SELECT ...;
```

인덱스가 필요하면 적용된 Flyway 파일을 고치지 않고 새 마이그레이션을 추가한다.

## 15. 안전한 개선 순서

1. 대시보드·여행방 API의 Repository 호출 횟수 측정
2. 반복문 Repository 호출과 N+1 제거
3. 중복 조회 통합 및 DTO Projection 검토
4. 느린 SQL 실행 계획 확인
5. 필요한 인덱스를 새 Flyway 마이그레이션으로 추가
6. 트랜잭션 범위에서 외부 작업 제거
7. 동일 시나리오 재측정
8. DB가 여유 있을 때만 Hikari를 10→20처럼 단계 조정

Hikari 설정 비교는 performance 프로필에서만 수행한다.

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 10
      connection-timeout: 3000
```

풀을 늘린 뒤에는 Hikari pending뿐 아니라 MySQL CPU, 연결 수, 디스크 I/O와 API p95가
함께 개선되는지 확인한다. 풀만 늘리고 DB가 더 느려지면 원래 값으로 복구한다.

## 16. 스크린샷과 결과 자료

Grafana 시간 범위를 테스트 시각으로 고정하고 자동 새로고침을 멈춘다. 민감정보와
토큰은 화면에 표시하지 않는다.

권장 캡처:

| 파일명 | 화면 | 전달할 메시지 |
|---|---|---|
| `01-k6-test-summary.png` | k6 최종 요약 | VU, 요청 수, 오류율, p95 threshold |
| `02-api-latency.png` | RPS, 전체·URI별 p95, 5xx | 부하 증가와 지연의 관계 |
| `03-hikari-bottleneck.png` | active/max/pending, 획득·점유 | DB 커넥션 대기 증거 |
| `04-tomcat-jvm.png` | Tomcat, CPU, 힙, GC | 다른 병목 후보 비교 |
| `05-loki-errors.png` | 테스트 시간의 ERROR·5xx | 기능 오류와 지연 분리 |
| `06-mysql-top-sql.png` | Performance Schema 결과 | 개선할 SQL 우선순위 |

발표 흐름:

```text
부하 단계 증가
  → p95 상승 확인
  → Hikari active=max 및 pending 증가
  → CPU·GC와 비교
  → SQL/트랜잭션 병목 가설
  → 개선 후 같은 시나리오로 재검증
```

## 17. 정식 성능 시험 주의사항

로컬 PC에서 k6, 백엔드, MySQL, Prometheus, Loki, Grafana를 함께 실행하면 호스트가
병목이 될 수 있다. 정식 수치에는 다음 조건이 필요하다.

- k6와 테스트 서버를 다른 장비로 분리
- 가능하면 MySQL도 별도 장비 또는 인스턴스로 분리
- 운영 예상 데이터량과 인덱스 구성 사용
- 동일한 애플리케이션 JVM 옵션 사용
- 워밍업 후 본 테스트 실행
- 같은 시나리오를 최소 3회 반복하고 중앙값 비교
- 테스트 중 배치, 백업, 개발 작업 제거

로컬 1,000명 결과는 병목 후보를 찾는 개발 자료이며 그대로 운영 수용량으로 선언하지
않는다.

## 18. 종료와 정리

k6 환경변수를 정리한다.

```bash
unset TEST_PASSWORD EXPECT_EXTERNAL_GUARD PERFORMANCE_MEMBER_COUNT TRIP_ID
```

데이터를 유지하고 컨테이너만 중지한다.

```bash
docker compose -f backend/compose.yml stop mysql redis prometheus loki alloy grafana
```

컨테이너를 제거하되 볼륨은 유지한다.

```bash
docker compose -f backend/compose.yml down
```

다음 명령은 MySQL, Redis, Prometheus, Loki, Grafana 볼륨을 삭제한다.

```bash
docker compose -f backend/compose.yml down -v
```

`down -v`는 로컬 데이터가 정말 필요 없음을 확인한 경우에만 실행한다.

## 19. 자주 발생하는 문제

| 증상 | 원인 | 조치 |
|---|---|---|
| Grafana가 시작되지 않음 | 관리자 비밀번호 누락 | `backend/.env` 확인 |
| Prometheus `up=0` | 백엔드 미실행·접근 실패 | health와 `/actuator/prometheus` 확인 |
| Grafana 그래프가 비어 있음 | 시간 범위·수집 지연 | 시간 범위와 Prometheus 쿼리 확인 |
| Tomcat 스레드 패널이 비어 있음 | 설정 후 완전 재시작 안 함 | 백엔드 프로세스 완전 종료 후 재기동 |
| Loki 로그가 없음 | 로그 파일·Alloy 마운트 문제 | 파일과 `/var/log/plamingo` 확인 |
| k6 로그인 실패 | 시드·비밀번호 불일치 | performance 프로필과 계정 확인 |
| k6 종료 코드 99 | threshold 실패 | 실패한 metric과 Grafana 시간대 비교 |
| 503 두 건이 보임 | 외부 API 차단 검증 | 본 테스트 시각 이전인지 확인 |
| 높은 interrupted 수 | 감압 중 반복 종료 가능 | `http_req_failed`와 함께 판단 |
| 모든 지표가 동시에 느림 | 동일 호스트 자원 고갈 | 부하 발생기와 서버 분리 |

## 20. 완료 체크리스트

### 실행 전

- [ ] 운영 서버·DB가 아닌지 확인
- [ ] Docker, Java 21, 포트 확인
- [ ] `local,performance` 프로필 확인
- [ ] 외부 API 503 차단 확인
- [ ] Prometheus `up=1`
- [ ] Loki 백엔드·액세스 로그 확인
- [ ] Smoke 성공
- [ ] 50명 Load 성공

### 실행 중

- [ ] 시작·종료 시각 기록
- [ ] k6 진행 단계 기록
- [ ] RPS와 p95 관찰
- [ ] Hikari pending 관찰
- [ ] 5xx·ERROR 급증 여부 확인
- [ ] 호스트 자원 고갈 여부 확인

### 실행 후

- [ ] k6 최종 출력과 종료 코드 저장
- [ ] Grafana 시간 범위 고정
- [ ] Loki ERROR·5xx 대조
- [ ] Hikari·Tomcat·CPU·GC 비교
- [ ] Performance Schema 상위 SQL 저장
- [ ] 권장 스크린샷 캡처
- [ ] 합격·실패와 근거 기록
- [ ] 개선 후 동일 시나리오 재시험 계획 작성
