# Plamingo 로컬 성능 모니터링 가이드

Prometheus, Grafana, Loki, Alloy, k6를 연결해 Spring Boot 백엔드의 요청량, 오류율, 응답 시간, JVM 메모리와 로그를 로컬에서 확인한다.

> 이 구성은 로컬 테스트 전용이다. 운영 서버 URL이나 운영 데이터베이스를 대상으로 실행하지 않는다.

## 0. 전체 구성

```text
k6
 └─ HTTP/WebSocket 부하
           ↓
Spring Boot :8080
 ├─ /actuator/prometheus → Prometheus :9090 ┐
 └─ 애플리케이션·액세스 로그 → Alloy → Loki :3100
                                             ↓
                                        Grafana :3001
```

- **Spring Boot Actuator**: `/actuator/prometheus`로 HTTP 요청, 오류, 응답 시간, JVM 지표를 노출한다.
- **Prometheus**: Spring Boot 지표를 5초마다 수집하고 k6 지표를 Remote Write로 저장한다.
- **Alloy**: Spring Boot 애플리케이션 로그와 Tomcat 액세스 로그를 읽어 Loki로 전송한다.
- **Loki**: 성능 테스트 로그를 7일간 로컬에 보관하고 LogQL 조회를 제공한다.
- **Grafana**: Prometheus 데이터를 미리 구성된 `Plamingo Backend` 대시보드로 표시한다.
- **k6**: Smoke, Load, Spike, Stress, Soak, WebSocket 시나리오로 부하를 발생시킨다.

## 1. 관련 파일

| 파일 | 역할 |
| --- | --- |
| `backend/compose.yml` | MySQL, Redis, Prometheus, Loki, Alloy, Grafana 실행 |
| `backend/src/main/resources/application-local.yml` | 로컬 Actuator 및 HTTP 히스토그램 설정 |
| `backend/src/main/resources/application-performance.yml` | 외부 API 차단과 성능 테스트 전용 설정 |
| `performance/start-monitoring.sh` | macOS/Linux 모니터링 환경 실행 및 준비 상태 확인 |
| `performance/start-monitoring.ps1` | Windows 모니터링 환경 실행 및 준비 상태 확인 |
| `performance/prometheus/prometheus.yml` | Spring Boot 지표 수집 및 Remote Write 수신 설정 |
| `performance/LOAD_TEST_RUNBOOK.md` | 설치부터 결과 보고까지 전체 부하 테스트 실행 절차 |
| `performance/PERFORMANCE_BOTTLENECK_GUIDE.md` | Grafana 병목 분석 순서, PromQL 및 판정 기준 |
| `performance/loki/loki-config.yml` | Loki 로컬 저장소와 7일 보관 설정 |
| `performance/alloy/config.alloy` | 애플리케이션·액세스 로그 수집 설정 |
| `performance/LOKI_GUIDE.md` | Loki 실행, 조회, 문제 해결 가이드 |
| `performance/grafana/provisioning/` | Prometheus 데이터소스와 대시보드 자동 등록 |
| `performance/grafana/dashboards/plamingo-backend.json` | Grafana 기본 대시보드 |
| `performance/compose.yml` | k6 컨테이너 설정 |
| `performance/k6/` | 부하 테스트 시나리오 |

## 2. 사전 준비

필요한 도구:

- Docker Desktop
- Java 21
- `curl`

설치 상태를 확인한다.

```bash
docker --version
docker compose version
java -version
curl --version
```

Docker Desktop이 실행 중이어야 한다.

### Grafana 환경변수

`backend/.env`에 다음 값을 추가한다. 실제 비밀번호가 들어간 `.env`는 커밋하지 않는다.

```env
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=로컬에서_사용할_비밀번호
GRAFANA_PORT=3001
```

- `GRAFANA_ADMIN_USER` 기본값은 `admin`이다.
- `GRAFANA_PORT` 기본값은 `3001`이다.
- `GRAFANA_ADMIN_PASSWORD`는 필수다.
- 기존 MySQL, Redis, JWT 등 백엔드 실행 환경변수도 정상적으로 설정돼 있어야 한다.

## 3. 모니터링 환경 실행

프로젝트 최상위 디렉터리에서 실행한다.

### macOS 또는 Linux

```bash
./performance/start-monitoring.sh
```

실행 권한 오류가 발생하면 한 번만 다음 명령을 실행한다.

```bash
chmod +x performance/start-monitoring.sh
./performance/start-monitoring.sh
```

### Windows PowerShell

```powershell
.\performance\start-monitoring.ps1
```

스크립트는 다음 작업을 수행한다.

1. MySQL, Redis, Prometheus, Loki, Alloy, Grafana 컨테이너 실행
2. 실제 Grafana 호스트 포트 확인
3. Prometheus와 Grafana가 응답할 때까지 최대 60초 대기
4. 접속 주소 출력

컨테이너 상태를 직접 확인하려면 다음 명령을 사용한다.

```bash
docker compose -f backend/compose.yml ps
```

## 4. 백엔드 실행

외부 Google Maps, OpenAI, Brevo, S3 호출을 막기 위해 `performance` 프로필을 함께 활성화한다.

```bash
cd backend
SPRING_PROFILES_ACTIVE=local,performance ./gradlew bootRun
```

OAuth 로그인까지 확인해야 할 때만 `oauth` 프로필을 추가한다.

```bash
SPRING_PROFILES_ACTIVE=local,oauth,performance ./gradlew bootRun
```

백엔드가 시작되면 별도 터미널에서 확인한다.

```bash
curl --fail http://localhost:8080/actuator/health
curl --fail http://localhost:8080/actuator/prometheus | head
```

두 명령 모두 오류 없이 응답해야 한다.

### 외부 API 차단 확인

`performance` 프로필에서는 비용이 발생할 수 있는 외부 연동 경로가 기본적으로 `503`으로 차단된다.

```bash
curl -i 'http://localhost:8080/api/places/search?query=osaka'
```

응답 상태가 `503 Service Unavailable`이면 차단 설정이 정상이다.

> `PERFORMANCE_ALLOW_EXTERNAL_APIS=true`는 비용 및 쿼터 제한을 준비한 별도 통합 테스트가 아니면 사용하지 않는다.

## 5. Prometheus와 Grafana 확인

| 대상 | 주소 | 계정 |
| --- | --- | --- |
| Backend Health | http://localhost:8080/actuator/health | 없음 |
| Backend Metrics | http://localhost:8080/actuator/prometheus | 없음 |
| Prometheus | http://localhost:9090 | 없음 |
| Loki | http://localhost:3100/ready | 없음 |
| Alloy UI | http://localhost:12345 | 없음 |
| Grafana | http://localhost:3001 | `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` |

Grafana 로그인 후 다음 경로로 이동한다.

```text
Dashboards → Plamingo → Plamingo Backend
```

로그는 `Explore → Loki`에서 조회한다. 상세 쿼리와 검증 절차는
[`performance/LOKI_GUIDE.md`](./LOKI_GUIDE.md)를 참고한다.

기본 대시보드는 5초마다 새로고침되며 API 응답시간·오류율, HikariCP,
Tomcat 스레드, CPU, JVM 힙과 GC를 포함한 15개 패널을 표시한다. 처음부터
결과 보고까지의 전체 절차는 [`LOAD_TEST_RUNBOOK.md`](./LOAD_TEST_RUNBOOK.md)를
참고한다.

### Prometheus 수집 상태 확인

Prometheus의 Graph 화면에서 다음 쿼리를 실행한다.

```promql
up{job="plamingo-backend"}
```

- `1`: Spring Boot 지표 수집 정상
- `0`: 백엔드가 꺼졌거나 Prometheus가 백엔드에 접근하지 못함

## 6. k6 Smoke 테스트

큰 부하를 실행하기 전에 Smoke 테스트로 로그인, API 연결, 외부 API 차단을 먼저 검증한다.

프로젝트 최상위 디렉터리에서 새 터미널을 연다.

```bash
export TEST_PASSWORD='PlamingoTest1!'
export EXPECT_EXTERNAL_GUARD=true
```

Smoke 테스트를 실행하고 k6 결과를 Prometheus에 저장한다.

```bash
docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/smoke.js
```

Smoke 테스트는 다음 항목을 확인한다.

- 테스트 계정 로그인 및 JWT 발급
- `/actuator/health` 정상 응답
- 여행방 목록 조회 정상 응답
- 외부 Google Places 검색 경로가 `503`으로 차단되는지 확인

테스트 계정은 로컬 또는 성능 프로필에서 백엔드가 시작될 때 생성된다.

```text
아이디: test-user-1@plamingo.app
비밀번호: PlamingoTest1!
```

이 계정은 로컬 성능 테스트 전용이며 운영 데이터나 운영 서버에서 사용하지 않는다.

## 7. k6 부하 테스트

Smoke 테스트가 성공한 후 필요한 시나리오만 실행한다.

### Load

일반적인 사용자 증가 상황을 확인한다.

```bash
docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/load.js
```

### Spike

짧은 시간에 사용자가 급증하는 상황을 확인한다.

```bash
docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/spike.js
```

### Stress

사용자를 단계적으로 늘려 시스템 한계를 확인한다.

```bash
docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/stress.js
```

### Soak

일정 부하를 장시간 유지해 메모리 누수와 성능 저하를 확인한다.

```bash
docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/soak.js
```

기본 유지 시간은 30분이다. 시간을 줄이거나 늘리려면 다음처럼 지정한다.

```bash
docker compose -f performance/compose.yml run --rm \
  -e SOAK_DURATION=10m k6 \
  run -o experimental-prometheus-rw /scripts/soak.js
```

### WebSocket

연결 수립 성능만 확인할 때는 `TRIP_ID` 없이 실행한다.

```bash
docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/websocket.js
```

특정 여행방 구독까지 확인하려면 테스트 계정이 접근할 수 있는 여행방 ID를 지정한다.

```bash
export TRIP_ID=1

docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/websocket.js
```

## 8. 시나리오 선택 기준

| 시나리오 | 목적 | 최대 가상 사용자 | 실행 시점 |
| --- | --- | ---: | --- |
| Smoke | 연결과 기본 동작 확인 | 1 | 항상 가장 먼저 |
| Load | 일반 트래픽 성능 확인 | 50 | 기능 배포 전 |
| Spike | 순간 트래픽 급증 확인 | 200 | 이벤트성 트래픽 대비 |
| Stress | 처리 한계 확인 | 200 | 병목 분석 시 |
| Soak | 장시간 안정성 확인 | 30 | 메모리 누수 점검 시 |
| WebSocket | 실시간 연결 성능 확인 | 50 | 실시간 기능 변경 시 |

Load, Spike, Stress, Soak의 기본 조회 시나리오는 다음 API만 호출한다.

- 여행방 목록
- 알림 목록
- 읽지 않은 알림 수
- 공개 카드 목록

Google Maps, OpenAI, Brevo, S3 API는 호출하지 않는다.

## 9. 결과 판단

| 구분 | 기본 합격 기준 |
| --- | ---: |
| 일반 조회 p95 | 500ms 미만 |
| 일반 조회 p99 | 1초 미만 |
| 일반 조회 오류율 | 1% 미만 |
| Spike/Stress 오류율 | 5% 미만 |
| WebSocket 연결 p95 | 1초 미만 |
| CPU, 메모리, DB 커넥션 풀 | 지속 사용률 80% 미만 권장 |

한 번의 숫자만 보지 말고 다음을 함께 확인한다.

- 부하가 증가할 때 p95와 p99가 계속 상승하는지
- 부하가 끝난 뒤 JVM 메모리가 일정 수준으로 회복되는지
- 5xx가 특정 API에 집중되는지
- Prometheus `up`이 테스트 도중 끊기지 않는지
- k6 Threshold가 실패했는지

## 10. Prometheus 직접 조회

Grafana에서 이상을 발견했을 때 Prometheus에서 다음 쿼리로 원본 지표를 확인한다.

### 수집 상태

```promql
up{job="plamingo-backend"}
```

### 초당 요청 수

```promql
sum(rate(http_server_requests_seconds_count[1m]))
```

### 5xx 오류율

```promql
sum(rate(http_server_requests_seconds_count{status=~"5.."}[1m]))
/
clamp_min(sum(rate(http_server_requests_seconds_count[1m])), 1e-9)
```

### 응답 시간 p95

```promql
histogram_quantile(
  0.95,
  sum(rate(http_server_requests_seconds_bucket[5m])) by (le)
)
```

### 응답 시간 p99

```promql
histogram_quantile(
  0.99,
  sum(rate(http_server_requests_seconds_bucket[5m])) by (le)
)
```

### JVM 힙 사용량

```promql
jvm_memory_used_bytes{area="heap"}
```

## 11. 종료

k6용 셸 환경변수를 정리한다.

```bash
unset TEST_PASSWORD EXPECT_EXTERNAL_GUARD TRIP_ID
```

컨테이너를 중지하되 데이터를 유지하려면 다음 명령을 사용한다.

```bash
docker compose -f backend/compose.yml stop mysql redis prometheus loki alloy grafana
```

컨테이너를 제거하되 볼륨을 유지하려면 다음 명령을 사용한다.

```bash
docker compose -f backend/compose.yml down
```

MySQL, Redis, Prometheus, Grafana 데이터를 모두 초기화해야 할 때만 `-v`를 사용한다.

```bash
docker compose -f backend/compose.yml down -v
```

> `down -v`는 로컬 DB 데이터까지 삭제하므로 평소에는 실행하지 않는다.

## 12. 문제 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| Docker 명령이 실행되지 않음 | Docker Desktop이 꺼져 있음 | Docker Desktop 실행 후 재시도 |
| `Permission denied` | macOS 실행 권한 없음 | `chmod +x performance/start-monitoring.sh` |
| `Port 8080 was already in use` | 기존 백엔드 프로세스가 남아 있음 | `lsof -nP -iTCP:8080 -sTCP:LISTEN`으로 PID 확인 후 해당 프로세스 종료 |
| Grafana 컨테이너 기동 실패 | `GRAFANA_ADMIN_PASSWORD` 누락 | `backend/.env`에 값 추가 후 스크립트 재실행 |
| Grafana에 대시보드가 없음 | provisioning 마운트 또는 초기화 문제 | `docker compose -f backend/compose.yml restart grafana` |
| Prometheus `up = 0` | 백엔드 미실행 또는 접근 실패 | 백엔드와 `http://localhost:8080/actuator/prometheus` 확인 후 5~10초 대기 |
| k6 로그인 실패 | 백엔드 미실행 또는 비밀번호 불일치 | `TEST_PASSWORD='PlamingoTest1!'` 및 백엔드 로그 확인 |
| k6 Remote Write 실패 | Prometheus 미실행 또는 수신 비활성화 | Prometheus를 `backend/compose.yml`로 재실행 |
| Grafana 그래프가 비어 있음 | 아직 요청이나 수집 데이터가 없음 | Smoke 테스트 실행 후 10초 대기 |
| 외부 API 차단 검증 실패 | `performance` 프로필 미적용 | `SPRING_PROFILES_ACTIVE=local,performance`로 백엔드 재실행 |

포트 충돌이 발생하면 먼저 프로세스를 확인한다.

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
lsof -nP -iTCP:9090 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

PID를 확인한 후, 종료 대상이 맞을 때만 정상 종료한다.

```bash
kill -TERM <확인한_PID>
```

컨테이너 로그는 다음처럼 확인한다.

```bash
docker compose -f backend/compose.yml logs --tail=200 prometheus
docker compose -f backend/compose.yml logs --tail=200 grafana
```

## 13. 실서비스형 1,000명 시나리오

외부 API를 호출하지 않고 서로 다른 계정 1,000명이 서비스를 사용하는 상황을 재현한다.
`performance` 프로필을 처음 실행하면 아래 데이터가 자동으로 준비된다.

- 회원 1,000명: `performance-user-0001@plamingo.app` ~ `performance-user-1000@plamingo.app`
- 공통 비밀번호: `PlamingoLoad1!`
- 여행방 100개, 여행방별 회원 10명
- 여행방별 일정 5일
- 회원별 알림 5개

시드 설정은 필요할 때만 성능 테스트 전용 환경변수로 변경한다.

```env
PERFORMANCE_SEED_ENABLED=true
PERFORMANCE_MEMBER_COUNT=1000
PERFORMANCE_MEMBERS_PER_TRIP=10
```

시드는 이메일과 여행방 제목을 기준으로 중복 생성을 방지한다. 운영 환경에서는
`performance` 프로필을 활성화하지 않는다.

### HTTP 혼합 부하

실행 시간은 총 30분이며 100명, 300명, 500명, 750명, 1,000명 순서로 증가한 뒤
1,000명을 10분간 유지한다.

- 사용자마다 서로 다른 계정으로 1회 로그인
- 30%: 여행방 목록, 알림, 읽지 않은 알림 수 조회
- 70%: 여행방 멤버와 저장된 일정 조회
- 30초마다 접속 상태 갱신
- 사용자 행동 간 2~8초 대기
- Google Maps, OpenAI, Brevo, S3 호출 없음

```powershell
$env:TEST_PASSWORD='PlamingoLoad1!'
.\performance\run-test.ps1 -Scenario realistic-load -PrometheusOutput
```

기본 합격 기준은 전체 HTTP 실패율 1% 미만, 대시보드 조회 p95 500ms 미만,
여행방 조회 p95 700ms 미만, 쓰기 요청 p95 1초 미만이다.

### WebSocket 1,000연결

HTTP 부하와 분리해 STOMP 인증, 구독, 연결 유지 한계를 측정한다. 100개, 500개,
1,000개 연결로 단계적으로 증가하고 1,000개 연결을 5분간 유지한다.

```powershell
$env:TEST_PASSWORD='PlamingoLoad1!'
.\performance\run-test.ps1 -Scenario realistic-websocket -PrometheusOutput
```

기본 합격 기준은 연결 실패율 1% 미만, 연결 수립 p95 1초 미만이다. 단일 로컬 PC에서
HTTP 1,000명과 WebSocket 1,000연결을 동시에 실행하면 부하 발생기 자체가 병목이 될 수
있으므로 기준 측정은 각각 실행한다.
