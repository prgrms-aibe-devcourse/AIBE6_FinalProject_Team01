import assert from 'node:assert/strict'
import test from 'node:test'

import { isPastTripDate, localDateToday } from './trip-date-policy.ts'

test('t1 오늘보다 이전 날짜만 과거로 판단한다', () => {
    assert.equal(isPastTripDate('2026-08-20', '2026-08-21'), true)
    assert.equal(isPastTripDate('2026-08-21', '2026-08-21'), false)
    assert.equal(isPastTripDate('2026-08-22', '2026-08-21'), false)
})

test('t2 현재 날짜는 로컬 시간대 기준 YYYY-MM-DD로 만든다', () => {
    assert.equal(localDateToday(new Date(2026, 7, 21, 23, 30)), '2026-08-21')
})
