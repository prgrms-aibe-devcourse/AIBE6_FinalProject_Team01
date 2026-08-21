import assert from 'node:assert/strict'
import test from 'node:test'
import {
    isAccountSuspendedEvent,
    isExpenseRealtimeEvent,
    isTripRealtimeEvent,
    parseRealtimeMessage,
    shouldDispatchNotificationToTrip,
    shouldRefreshTripList,
} from '../../../shared/lib/realtime-event.ts'

test('t7 같은 여행방의 지출 이벤트만 정산 화면 갱신 대상으로 판단한다', () => {
    const expense = {
        eventId: 'event-expense',
        type: 'TRIP_CHANGED',
        tripId: 7,
        targetType: 'EXPENSE',
        targetId: 10,
        occurredAt: '2026-08-21T00:00:00Z',
    }

    assert.equal(isExpenseRealtimeEvent(expense, 7), true)
    assert.equal(isExpenseRealtimeEvent(expense, 8), false)
    assert.equal(
        isExpenseRealtimeEvent({ ...expense, targetType: 'TRIP_PLACE' }, 7),
        false,
    )
})

test('t1 올바른 객체 메시지를 파싱한다', () => {
    assert.deepEqual(parseRealtimeMessage('{"eventId":"event-1"}'), {
        eventId: 'event-1',
    })
})

test('t6 여행방 알림 웹소켓 메시지는 여행방 화면 갱신에도 사용한다', () => {
    const notification = {
        eventId: 'event-notification',
        type: 'NOTIFICATION_CHANGED',
        tripId: 7,
        targetType: 'NOTIFICATION',
        targetId: 10,
        occurredAt: '2026-08-21T00:00:00Z',
    }

    assert.equal(shouldDispatchNotificationToTrip(notification), true)
    assert.equal(
        shouldDispatchNotificationToTrip({ ...notification, tripId: null }),
        false,
    )
})

test('t5 여행방 종료 이벤트는 화면 전달 전에 여행방 목록을 갱신한다', () => {
    const completed = {
        eventId: 'event-completed',
        type: 'TRIP_CHANGED',
        tripId: 7,
        targetType: 'TRIP',
        targetId: 7,
        occurredAt: '2026-08-21T00:00:00Z',
    }
    const placeChanged = {
        ...completed,
        eventId: 'event-place',
        targetType: 'TRIP_PLACE',
    }

    assert.equal(shouldRefreshTripList(completed), true)
    assert.equal(shouldRefreshTripList(placeChanged), false)
})

test('t2 잘못된 JSON 메시지는 예외 없이 무시한다', () => {
    assert.equal(parseRealtimeMessage('{invalid'), null)
})

test('t3 대상 여행방과 이벤트 유형이 모두 일치할 때만 처리한다', () => {
    const event = {
        eventId: 'event-1',
        type: 'TRIP_MEMBERS_CHANGED',
        tripId: 7,
        targetType: 'TRIP',
        targetId: 7,
        occurredAt: '2026-08-14T00:00:00Z',
    }

    assert.equal(isTripRealtimeEvent(event, 7, 'TRIP_MEMBERS_CHANGED'), true)
    assert.equal(isTripRealtimeEvent(event, 8, 'TRIP_MEMBERS_CHANGED'), false)
    assert.equal(isTripRealtimeEvent(null, 7, 'TRIP_MEMBERS_CHANGED'), false)
})

test('t4 현재 회원에게 전달된 유효한 정지 이벤트만 처리한다', () => {
    assert.equal(
        isAccountSuspendedEvent(
            { memberId: 7, noticeToken: 'notice-token' },
            7,
        ),
        true,
    )
    assert.equal(
        isAccountSuspendedEvent(
            { memberId: 8, noticeToken: 'notice-token' },
            7,
        ),
        false,
    )
    assert.equal(
        isAccountSuspendedEvent({ memberId: 7, noticeToken: '   ' }, 7),
        false,
    )
})
