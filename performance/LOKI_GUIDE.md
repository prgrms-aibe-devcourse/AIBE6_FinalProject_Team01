# Plamingo Loki 로그 확인 가이드

성능 테스트 전에 Loki와 Alloy를 실행하고, Spring Boot의 애플리케이션 로그와
Tomcat 액세스 로그가 Grafana에 들어오는지 검증한다.

## 1. 수집 구조

```text
Spring Boot
 ├─ build/performance-logs/backend.log  ─┐
 └─ build/performance-logs/access*.log ──┴→ Alloy → Loki → Grafana Explore
```

- `backend.log`: Spring Boot, 애플리케이션, WARN, ERROR, 예외 로그
- `access*.log`: HTTP 메서드, 경로, 상태 코드, 처리 시간, 응답 크기
- 로그 파일에는 JWT, 쿠키, 요청 본문과 같은 민감정보를 기록하지 않는다.

## 2. 실행 순서

프로젝트 루트에서 Docker Desktop 실행 상태를 확인한다.

```bash
docker --version
docker compose version
```

모니터링 환경을 실행한다.

```bash
./performance/start-monitoring.sh
```

Windows PowerShell에서는 다음을 실행한다.

```powershell
.\performance\start-monitoring.ps1
```

백엔드는 반드시 `performance` 프로필과 함께 실행한다.

```bash
cd backend
SPRING_PROFILES_ACTIVE=local,performance ./gradlew bootRun
```

`performance` 프로필이 로그 파일과 액세스 로그를 생성하며 비용이 발생할 수 있는
Google Maps, OpenAI, Brevo, S3 호출도 차단한다.

## 3. 수집 전 검증

컨테이너 상태를 확인한다.

```bash
docker compose -f backend/compose.yml ps
```

다음 서비스가 실행 중이어야 한다.

```text
mysql redis prometheus loki alloy grafana
```

Loki 준비 상태를 확인한다.

```bash
curl --fail http://localhost:3100/ready
```

로그 파일 생성을 확인한다.

```bash
find backend/build/performance-logs -maxdepth 1 -type f -print
tail -n 20 backend/build/performance-logs/backend.log
```

백엔드 API를 한 번 호출한 뒤 액세스 로그를 확인한다.

```bash
curl --fail http://localhost:8080/actuator/health
tail -n 20 backend/build/performance-logs/access*.log
```

Alloy가 같은 파일을 볼 수 있는지 확인한다.

```bash
docker exec plamingo-alloy sh -c 'ls -lh /var/log/plamingo'
```

Alloy 전송 오류를 확인한다.

```bash
docker compose -f backend/compose.yml logs --tail=100 alloy
docker compose -f backend/compose.yml logs --tail=100 loki
```

`file not found`, `permission denied`, `failed to push`, `connection refused`가
지속해서 나오면 부하 테스트를 시작하지 않는다.

## 4. Grafana에서 로그 확인

`http://localhost:3001`에 접속한 뒤 다음 경로로 이동한다.

```text
Explore → 데이터소스 Loki → 시간 범위 Last 15 minutes
```

전체 애플리케이션 로그:

```logql
{job="plamingo-backend"}
```

WARN과 ERROR:

```logql
{job="plamingo-backend"} |~ "WARN|ERROR"
```

처리되지 않은 예외:

```logql
{job="plamingo-backend"} |= "Unhandled exception"
```

DB, Redis, 메모리 오류:

```logql
{job="plamingo-backend"}
  |~ "(?i)hikari|connection.*timeout|sql.*exception|redis|lettuce|OutOfMemoryError|heap space"
```

전체 액세스 로그:

```logql
{job="plamingo-access"}
```

HTTP 5xx:

```logql
{job="plamingo-access"} |~ "status=5[0-9]{2}"
```

특정 API:

```logql
{job="plamingo-access"} |= "path=/api/trips"
```

상태 코드별 분당 요청 수:

```logql
sum by (status) (
  count_over_time(
    {job="plamingo-access"}
      | regexp "status=(?P<status>[0-9]{3})"
    [1m]
  )
)
```

API별 p95 처리 시간(마이크로초):

```logql
quantile_over_time(
  0.95,
  {job="plamingo-access"}
    | regexp "path=(?P<path>[^ ]+).*duration_us=(?P<duration_us>[0-9]+)"
    | unwrap duration_us
  [5m]
) by (path)
```

## 5. 부하 테스트와 함께 확인

Smoke 테스트로 로그와 메트릭 수집을 먼저 검증한다.

```bash
export TEST_PASSWORD='PlamingoTest1!'
export EXPECT_EXTERNAL_GUARD=true

docker compose -f performance/compose.yml run --rm k6 \
  run -o experimental-prometheus-rw /scripts/smoke.js
```

Grafana Explore에서 `{job="plamingo-access"}` 로그가 증가하는지 확인한 뒤 본
부하 테스트를 실행한다.

```bash
export TEST_PASSWORD='PlamingoLoad1!'

docker compose -f performance/compose.yml run --rm \
  -e PERFORMANCE_MEMBER_COUNT=1000 \
  k6 run -o experimental-prometheus-rw /scripts/realistic-load.js
```

Prometheus에서 5xx가 증가한 시각을 확인한다.

```promql
sum by (method, uri, status) (
  rate(http_server_requests_seconds_count{status=~"5.."}[1m])
)
```

같은 시간 범위에서 Loki의 액세스 로그와 에러 로그를 차례로 확인한다.

```logql
{job="plamingo-access"} |~ "status=5[0-9]{2}"
```

```logql
{job="plamingo-backend"} |= "ERROR"
```

## 6. 정상 판단 기준

- `http://localhost:3100/ready`가 정상 응답한다.
- Grafana Explore에 `Loki` 데이터소스가 표시된다.
- `plamingo-backend`와 `plamingo-access` 로그가 모두 조회된다.
- Java 예외 스택 트레이스가 여러 줄로 분리되지 않고 한 건으로 표시된다.
- 부하 테스트 중 액세스 로그 건수가 증가한다.
- Prometheus 5xx 시각과 Loki의 5xx 액세스 로그 시각이 일치한다.
- Alloy 로그에 지속적인 전송 실패가 없다.

## 7. 문제 해결

| 증상 | 확인 사항 |
| --- | --- |
| Grafana에 Loki가 없음 | Grafana 재시작 및 `loki.yml` 마운트 확인 |
| `{job="plamingo-backend"}` 결과 없음 | `backend.log` 생성과 Alloy 파일 마운트 확인 |
| 액세스 로그가 없음 | `local,performance` 프로필과 `access*.log` 생성 확인 |
| Alloy `file not found` | `backend/build/performance-logs` 디렉터리 확인 |
| Alloy `failed to push` | Loki 컨테이너와 `http://loki:3100` 연결 확인 |
| ERROR가 검색되지 않음 | 전체 로그가 있다면 실제 오류가 없을 수 있음 |

## 8. 종료

로그와 메트릭 볼륨을 유지하면서 중지한다.

```bash
docker compose -f backend/compose.yml stop prometheus loki alloy grafana
```

`docker compose down -v`는 MySQL, Redis, Prometheus, Loki 데이터를 모두 삭제하므로
로컬 데이터를 초기화해야 할 때만 사용한다.
