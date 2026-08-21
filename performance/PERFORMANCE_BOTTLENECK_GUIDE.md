# Plamingo 성능 병목 분석 가이드

## 1. 대시보드 열기

1. 백엔드를 `local,performance` 프로필로 실행한다.
2. `./performance/start-monitoring.sh`를 실행한다.
3. `http://localhost:3001`에서 **Plamingo / Plamingo Backend** 대시보드를 연다.
4. 우측 상단 시간 범위를 부하 테스트 시작·종료 시각으로 고정한다.

백엔드를 다시 시작해야 새로 활성화한 Tomcat 스레드 메트릭이 노출된다.

## 2. 같은 시간축으로 확인할 지표

### HikariCP

- `DB 커넥션 풀`: active가 max에 붙고 idle이 0이면 풀이 포화된 상태다.
- `DB 커넥션 대기`: pending이 0보다 커지면 요청이 커넥션 반환을 기다리고 있다.
- `DB 커넥션 획득/점유`: acquire가 길면 풀 대기, usage가 길면 쿼리 또는 트랜잭션 점유가 길다는 의미다.
- `DB 커넥션 타임아웃`: 증가량이 0보다 크면 실패로 이어진 실제 풀 고갈이다.

### Tomcat

- `Tomcat 스레드 사용률`이 장시간 80% 이상이면 요청 처리 스레드가 포화에 가깝다.
- Hikari pending과 Tomcat 사용률이 함께 오르면 스레드가 DB 커넥션을 기다리는 상황일 가능성이 높다.
- Tomcat 메트릭이 비어 있으면 performance 프로필 적용 및 백엔드 재시작 여부를 확인한다.

### JVM

- `프로세스/시스템 CPU`에서 애플리케이션 CPU가 지속적으로 80% 이상이면 CPU 병목을 의심한다.
- `GC 정지 시간`과 힙 사용량이 동시에 급증하면 메모리 압박을 의심한다.
- GC 후에도 힙의 최저점이 계속 상승하면 누수 여부를 장시간 soak 테스트로 확인한다.

### API

- `URI별 p95`에서 느린 엔드포인트를 먼저 찾는다.
- `URI별 5xx 오류율`과 Loki 오류 로그를 같은 시각으로 대조한다.
- URI 라벨은 템플릿 경로이므로 사용자 ID 같은 고카디널리티 값이 포함되지 않는다.

## 3. 이번 1,000 VU 테스트 결과

테스트 시간: 2026-08-18 16:04~16:34 KST

| 지표 | 관측값 | 판정 |
|---|---:|---|
| 전체 요청 | 155,021건 | 측정 완료 |
| HTTP 실패율 | 0.01% | 오류율 기준 통과 |
| 전체 p95 | 26.63초 | 성능 기준 실패 |
| Hikari active 최대 | 10 | 풀 최대치 도달 |
| Hikari max | 10 | 설정 상한 |
| Hikari pending 최대 | 190 | 심한 커넥션 대기 |
| 커넥션 획득 최대 | 9.078초 | 풀 대기 병목 |
| 커넥션 점유 최대 | 1.706초 | 느린 쿼리/트랜잭션 후보 |
| 애플리케이션 CPU 최대 | 약 19% | 주 병목으로 보기 어려움 |
| 시스템 CPU 최대 | 약 92% | 로컬 통합 실행 환경 영향 확인 필요 |
| GC 최대 정지 | 130ms | 주 병목으로 보기 어려움 |
| GC 누적 정지(40분) | 약 7.94초 | 추가 관찰 대상 |

현재 증거상 첫 번째 병목 후보는 **Hikari 풀 포화**다. 단순히 풀 크기부터 늘리지 말고 아래 순서로 확인한다.

1. `대시보드 조회`, `여행방 진입`, 쓰기 API가 실행하는 Repository 쿼리를 찾는다.
2. N+1, 불필요한 반복 조회, 인덱스 누락 및 긴 트랜잭션을 확인한다.
3. MySQL Slow Query Log 또는 Performance Schema에서 실행 시간과 호출 횟수가 큰 SQL을 찾는다.
4. 쿼리를 개선한 뒤 같은 시나리오로 재측정한다.
5. DB가 감당할 수 있음을 확인한 후에만 Hikari `maximum-pool-size`를 단계적으로 조정한다.

## 4. MySQL에서 느린 SQL 확인

로컬 성능 테스트 DB에서만 다음 상태를 확인한다.

```sql
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';
SHOW VARIABLES LIKE 'performance_schema';
```

Performance Schema가 활성화되어 있으면 누적 시간이 큰 쿼리 형태를 확인한다.

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

실행 전후 누적 통계를 구분해야 한다면 테스트 직전에 성능 테스트 전용 DB에서만 다음 명령을 사용한다.

```sql
TRUNCATE TABLE performance_schema.events_statements_summary_by_digest;
```

공유·운영 DB에서는 다른 분석 데이터까지 지워지므로 실행하지 않는다.

## 5. Loki 대조 쿼리

Grafana Explore에서 테스트 시간 범위를 동일하게 맞춘다.

```logql
{job="plamingo-backend"} |= " ERROR "
```

```logql
{job="plamingo-access"} |~ "status=5[0-9]{2}"
```

```logql
sum by (path) (
  count_over_time({job="plamingo-access"} | regexp `path=(?P<path>\\S+)` [1m])
)
```

## 6. 재시험 합격 기준

- HTTP 실패율: 1% 미만
- 대시보드 p95: 500ms 미만
- 여행방 p95: 700ms 미만
- 쓰기 API p95: 1초 미만
- Hikari pending: 정상 부하에서 지속적으로 0
- Tomcat 스레드 사용률: 장시간 80% 미만
- 테스트 시간대 예상하지 않은 5xx 및 ERROR: 0건
