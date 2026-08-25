# 부하 테스트 병목 분석 및 개선 기록

## 1. 측정 결과

현재 1순위 병목은 HikariCP DB 커넥션 풀 포화로 판단한다.

| 지표 | 측정값 | 판단 |
|---|---:|---|
| Hikari 최대 커넥션 | 10 | 기존 풀 상한 |
| active 최대 | 10 | 모든 커넥션 사용 |
| pending 최대 | 190 | 요청이 커넥션 반환 대기 |
| 커넥션 획득 대기 최대 | 9.078초 | 풀 대기 병목 |
| 커넥션 점유 최대 | 1.706초 | 느린 SQL 또는 넓은 트랜잭션 후보 |
| 전체 p95 | 25~30초 | 목표 초과 |
| 시스템 CPU 최대 | 약 92% | 통합 로컬 실행 환경 영향 가능 |
| 애플리케이션 CPU 최대 | 약 19% | 애플리케이션 CPU가 1순위 병목은 아님 |

요청이 증가하면서 커넥션 10개가 모두 사용되고 최대 190개 요청이 DB 연결을 기다렸다.
따라서 풀 크기만 크게 늘리기 전에 대시보드와 여행방 진입 API의 SQL 호출 횟수와
커넥션 점유시간을 먼저 줄인다.

## 2. 이번 코드 개선

- `GET /api/trips`: 여행별 멤버 수 `count` N+1을 여행 ID 일괄 집계 쿼리 1회로 변경
- `GET /api/cards/public` 기본 최신순: 전체 공개 카드를 조회한 뒤 메모리에서 자르던 방식을 DB 페이지네이션으로 변경
- 알림 목록과 미읽음 개수, 공개 카드 최신순 조회에 맞는 복합 인덱스 추가
- 성능 프로필 Hikari 기본값을 `10 -> 20`으로 단계 조정하고 환경변수로 재시험 가능하게 구성

검색·스타일 필터와 인기순·댓글순은 기존 동작을 보존했다. 이 경로는 다음 측정에서
상위 SQL로 확인될 경우 DB 조건 검색과 집계 정렬 방식으로 추가 개선한다.

## 3. 성능 테스트 전용 DB SQL 분석

통계 초기화는 공유 DB나 운영 DB에서 실행하지 않는다. 성능 테스트 전용 DB에서만 테스트 직전에 실행한다.

```sql
TRUNCATE TABLE performance_schema.events_statements_summary_by_digest;
```

테스트 종료 후 누적 실행시간이 큰 SQL을 확인한다.

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

우선 개선 대상은 다음과 같다.

- 호출 횟수(`COUNT_STAR`)가 비정상적으로 높은 SQL
- 반환 행보다 검사 행(`SUM_ROWS_EXAMINED`)이 훨씬 많은 SQL
- 평균 실행시간이 긴 SQL
- 대시보드·여행방 진입마다 반복되는 SQL

후보 SQL은 실제 값으로 `EXPLAIN ANALYZE`를 실행해 인덱스 사용 여부와 검사 행 수를 확인한다.

## 4. 재시험 설정

성능 프로필 기본 설정:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 10
      connection-timeout: 3000
```

다음 환경변수로 `10 -> 20 -> 30`을 동일 시나리오에서 비교한다.

```text
PERFORMANCE_HIKARI_MAXIMUM_POOL_SIZE
PERFORMANCE_HIKARI_MINIMUM_IDLE
PERFORMANCE_HIKARI_CONNECTION_TIMEOUT_MS
```

풀 크기를 바로 100으로 늘리지 않는다. 각 단계에서 Hikari pending, 획득시간,
MySQL CPU·디스크 I/O, API p95가 함께 개선되는지 확인한다.

## 5. 테스트 환경 및 목표

- k6와 서버를 가능하면 다른 장비로 분리
- MySQL도 가능하면 별도 인스턴스로 분리
- 운영 예상 데이터량 사용
- 워밍업 후 동일 시나리오 최소 3회 반복
- Tomcat 사용률과 Hikari pending을 같은 시간축으로 비교

합격 목표:

- 커넥션 획득 p95: 수십 ms 이하
- 대시보드 p95: 500ms 미만
- 여행방 p95: 700ms 미만
- 쓰기 API p95: 1초 미만
- HTTP 실패율: 1% 미만
- 예상하지 않은 5xx: 0건
- 정상 부하에서 Hikari pending이 지속적으로 0

이번 변경의 효과는 코드 테스트만으로 응답시간을 확정할 수 없으므로 동일한 k6 시나리오와
성능 테스트 전용 MySQL 데이터로 재측정해 전후 값을 비교한다.

## 6. 운영 적용

운영 프로필에도 동일한 기본값을 적용하며 배포 환경변수로 조정할 수 있다.

```text
HIKARI_MAXIMUM_POOL_SIZE=20
HIKARI_MINIMUM_IDLE=10
HIKARI_CONNECTION_TIMEOUT_MS=3000
```

운영 DB가 20개 동시 커넥션을 감당할 수 있는지 부하 테스트 결과와 DB 모니터링으로 확인한다.
문제가 확인되면 배포 환경변수만 변경해 풀 크기를 즉시 낮출 수 있다.
