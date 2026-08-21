import assert from 'node:assert/strict'
import test from 'node:test'
import {
    dateRange,
    formatKoreanRange,
    isSupportedAvailabilityDate,
    recommendDateRanges,
    updateDateSet,
    updateDateSetWithinLimit,
} from './date-availability.ts'

const member = (memberId, dates) => ({
    memberId,
    nickname: `멤버${memberId}`,
    profileImageUrl: null,
    availableDates: dates,
})

const groupByDate = (members) => {
    const result = new Map()
    members.forEach((item) => {
        item.availableDates.forEach((date) => {
            result.set(date, [...(result.get(date) ?? []), item])
        })
    })
    return result
}

test('t1 역방향 범위도 시작일과 종료일을 포함해 정렬한다', () => {
    assert.deepEqual(dateRange('2026-08-14', '2026-08-12'), [
        '2026-08-12',
        '2026-08-13',
        '2026-08-14',
    ])
})

test('t2 연도 경계를 넘는 날짜 범위를 생성한다', () => {
    assert.deepEqual(dateRange('2026-12-31', '2027-01-02'), [
        '2026-12-31',
        '2027-01-01',
        '2027-01-02',
    ])
})

test('t3 날짜 범위를 선택하고 같은 범위를 해제한다', () => {
    const selected = updateDateSet(
        new Set(['2026-08-11']),
        '2026-08-12',
        '2026-08-13',
        true,
    )
    assert.deepEqual([...selected].sort(), [
        '2026-08-11',
        '2026-08-12',
        '2026-08-13',
    ])

    const removed = updateDateSet(selected, '2026-08-12', '2026-08-13', false)
    assert.deepEqual([...removed], ['2026-08-11'])
})

test('t4 추천 기간 전체에 가능한 동일 멤버 수를 계산한다', () => {
    const availability = groupByDate([
        member(1, ['2026-08-12', '2026-08-13', '2026-08-14']),
        member(2, ['2026-08-12', '2026-08-13', '2026-08-14']),
        member(3, ['2026-08-12', '2026-08-13']),
        member(4, ['2026-08-14']),
    ])

    assert.deepEqual(recommendDateRanges(availability, 4)[0], {
        startDate: '2026-08-12',
        endDate: '2026-08-13',
        availableCount: 3,
    })
})

test('t5 추천 결과는 서로 겹치지 않는 최대 두 개의 기간이다', () => {
    const dates = [
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
        '2026-08-10',
        '2026-08-11',
        '2026-08-12',
    ]
    const availability = groupByDate([member(1, dates), member(2, dates)])
    const recommendations = recommendDateRanges(availability, 2)

    assert.equal(recommendations.length, 2)
    assert.ok(recommendations[0].endDate < recommendations[1].startDate)
})

test('t6 지원 날짜 경계 밖의 값은 선택할 수 없다', () => {
    assert.equal(isSupportedAvailabilityDate('2000-01-01'), true)
    assert.equal(isSupportedAvailabilityDate('2100-12-31'), true)
    assert.equal(isSupportedAvailabilityDate('1999-12-31'), false)
    assert.equal(isSupportedAvailabilityDate('2101-01-01'), false)
})

test('t7 시작일과 종료일이 같으면 하루 날짜로 표시한다', () => {
    assert.equal(formatKoreanRange('2026-08-05', '2026-08-05'), '8월 5일')
    assert.equal(formatKoreanRange('2026-08-05', '2026-08-07'), '8월 5일~7일')
})

test('t8 날짜 추가로 선택 한도를 초과하면 기존 선택을 유지한다', () => {
    const current = new Set(['2026-08-01', '2026-08-02'])
    const result = updateDateSetWithinLimit(
        current,
        '2026-08-03',
        '2026-08-04',
        true,
        3,
    )

    assert.equal(result.limitExceeded, true)
    assert.deepEqual([...result.dates].sort(), [...current].sort())
})

test('t9 선택 해제는 선택 한도와 관계없이 적용한다', () => {
    const current = new Set(['2026-08-01', '2026-08-02', '2026-08-03'])
    const result = updateDateSetWithinLimit(
        current,
        '2026-08-01',
        '2026-08-02',
        false,
        2,
    )

    assert.equal(result.limitExceeded, false)
    assert.deepEqual([...result.dates], ['2026-08-03'])
})

test('t10 공통으로 가능한 연속 날짜는 하루씩 나누지 않고 하나의 기간으로 추천한다', () => {
    const availability = groupByDate([
        member(1, ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']),
        member(2, ['2026-08-01', '2026-08-02', '2026-08-03']),
    ])

    assert.deepEqual(recommendDateRanges(availability, 2), [
        {
            startDate: '2026-08-01',
            endDate: '2026-08-03',
            availableCount: 2,
        },
    ])
})

test('t11 과거 가능 날짜는 추천 여행 기간에서 제외한다', () => {
    const availability = new Map([
        ['2026-08-20', [{ memberId: 1 }]],
        ['2026-08-22', [{ memberId: 1 }]],
    ])

    assert.deepEqual(
        recommendDateRanges(availability, 1, '2026-08-21'),
        [
            {
                startDate: '2026-08-22',
                endDate: '2026-08-22',
                availableCount: 1,
            },
        ],
    )
})
