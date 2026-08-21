export const REALTIME_EVENT_NAME = 'plamingo:realtime'

export type RealtimeEvent = {
    eventId: string
    type: string
    tripId: number | null
    targetType: string | null
    targetId: number | null
    occurredAt: string
}

export type AccountSuspendedEvent = {
    memberId: number
    noticeToken: string
}

export function parseRealtimeMessage<T>(body: string): T | null {
    try {
        const parsed: unknown = JSON.parse(body)
        return parsed !== null && typeof parsed === 'object'
            ? (parsed as T)
            : null
    } catch {
        return null
    }
}

export function isTripRealtimeEvent(
    event: RealtimeEvent | null | undefined,
    tripId: number,
    ...types: string[]
) {
    return (
        event != null && event.tripId === tripId && types.includes(event.type)
    )
}

export function isExpenseRealtimeEvent(event: RealtimeEvent, tripId: number) {
    return event.tripId === tripId && event.targetType === 'EXPENSE'
}

export function shouldRefreshTripList(event: RealtimeEvent) {
    return event.type === 'TRIP_MEMBERS_CHANGED' || event.targetType === 'TRIP'
}

export function shouldDispatchNotificationToTrip(event: RealtimeEvent) {
    return event.type === 'NOTIFICATION_CHANGED' && event.tripId != null
}

export function isAccountSuspendedEvent(
    event: Partial<AccountSuspendedEvent> | null | undefined,
    currentUserId: number,
): event is AccountSuspendedEvent {
    return (
        event?.memberId === currentUserId &&
        typeof event.noticeToken === 'string' &&
        event.noticeToken.trim().length > 0
    )
}
