import type { DateAvailability } from '@/entities/trip'

export type DateRecommendation = {
    startDate: string
    endDate: string
    availableCount: number
}

export const MIN_AVAILABILITY_DATE = '2000-01-01'
export const MAX_AVAILABILITY_DATE = '2100-12-31'
export const MAX_AVAILABILITY_DATES = 366

export function isSupportedAvailabilityDate(date: string) {
    return date >= MIN_AVAILABILITY_DATE && date <= MAX_AVAILABILITY_DATE
}

export function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(date: Date, amount: number) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

export function createCalendarDays(month: Date) {
    const first = startOfMonth(month)
    const start = new Date(
        first.getFullYear(),
        first.getMonth(),
        first.getDate() - first.getDay(),
    )
    return Array.from(
        { length: 42 },
        (_, index) =>
            new Date(
                start.getFullYear(),
                start.getMonth(),
                start.getDate() + index,
            ),
    )
}

export function formatLocalDate(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function parseLocalDate(value: string) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

export function dateRange(startDate: string, endDate: string) {
    const start = parseLocalDate(startDate <= endDate ? startDate : endDate)
    const end = parseLocalDate(startDate <= endDate ? endDate : startDate)
    const dates: string[] = []
    for (
        let current = start;
        current <= end;
        current = new Date(
            current.getFullYear(),
            current.getMonth(),
            current.getDate() + 1,
        )
    ) {
        dates.push(formatLocalDate(current))
    }
    return dates
}

export function recommendDateRanges(
    availabilityByDate: Map<string, DateAvailability[]>,
    memberCount: number,
    minimumDate?: string,
): DateRecommendation[] {
    const availableDates = Array.from(availabilityByDate.keys())
        .filter((date) => minimumDate == null || date >= minimumDate)
        .sort()
    if (availableDates.length === 0 || memberCount === 0) return []

    const firstDate = parseLocalDate(availableDates[0])
    const lastDate = parseLocalDate(availableDates.at(-1)!)
    const candidates: Array<DateRecommendation & { score: number }> = []

    for (let start = firstDate; start <= lastDate; start = addDays(start, 1)) {
        const startDate = formatLocalDate(start)
        let commonMemberIds: Set<number> | null = null
        let duration = 0
        for (let end = start; end <= lastDate; end = addDays(end, 1)) {
            const endDate = formatLocalDate(end)
            const members = availabilityByDate.get(endDate) ?? []
            const memberIds = new Set<number>(
                members.map((member) => member.memberId),
            )
            if (commonMemberIds == null) {
                commonMemberIds = memberIds
            } else {
                const previousMemberIds: Set<number> = commonMemberIds
                commonMemberIds = new Set<number>(
                    Array.from(previousMemberIds).filter((memberId) =>
                        memberIds.has(memberId),
                    ),
                )
            }
            if (commonMemberIds.size === 0) break
            duration += 1
            candidates.push({
                startDate,
                endDate,
                availableCount: commonMemberIds.size,
                score: duration,
            })
        }
    }

    candidates.sort(
        (left, right) =>
            right.availableCount - left.availableCount ||
            right.score - left.score ||
            left.startDate.localeCompare(right.startDate),
    )

    const bestAvailableCount = candidates[0]?.availableCount ?? 0
    const recommendations: DateRecommendation[] = []
    for (const candidate of candidates) {
        if (candidate.availableCount < bestAvailableCount) break
        const overlaps = recommendations.some(
            (selected) =>
                candidate.startDate <= selected.endDate &&
                candidate.endDate >= selected.startDate,
        )
        if (!overlaps) {
            recommendations.push({
                startDate: candidate.startDate,
                endDate: candidate.endDate,
                availableCount: candidate.availableCount,
            })
        }
        if (recommendations.length === 2) break
    }
    return recommendations
}

export function formatKoreanRange(startDate: string, endDate: string) {
    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)
    const startLabel = `${start.getMonth() + 1}월 ${start.getDate()}일`
    if (startDate === endDate) return startLabel

    const endLabel =
        start.getMonth() === end.getMonth()
            ? `${end.getDate()}일`
            : `${end.getMonth() + 1}월 ${end.getDate()}일`
    return `${startLabel}~${endLabel}`
}

export function updateDateSet(
    current: Set<string>,
    startDate: string,
    endDate: string,
    selecting: boolean,
) {
    const next = new Set(current)
    dateRange(startDate, endDate).forEach((date) => {
        if (selecting) next.add(date)
        else next.delete(date)
    })
    return next
}

export function updateDateSetWithinLimit(
    current: Set<string>,
    startDate: string,
    endDate: string,
    selecting: boolean,
    limit: number,
) {
    const next = updateDateSet(current, startDate, endDate, selecting)
    if (selecting && next.size > limit) {
        return { dates: new Set(current), limitExceeded: true }
    }
    return { dates: next, limitExceeded: false }
}

function addDays(date: Date, amount: number) {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + amount,
    )
}
