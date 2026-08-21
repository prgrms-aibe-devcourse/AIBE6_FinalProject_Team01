'use client'

import { useMemo, useState } from 'react'
import {
    AlertTriangleIcon,
    ArrowDownIcon,
    CheckIcon,
    Clock3Icon,
    LoaderCircleIcon,
    RouteIcon,
    XIcon,
} from 'lucide-react'
import type {
    ItineraryDay,
    ItineraryItem,
    RouteOption,
    RoutePlanPreview,
} from '@/entities/trip'
import { getApiErrorMessage } from '@/shared/api/client'
import { AnalysisStatusAnimation, Select } from '@/shared/ui'
import {
    applyAiItineraryReplan,
    previewAiItineraryReplan,
} from '../api/ai-trip-api'
import { AiBrandMark } from './ai-brand-mark'

type Props = {
    tripId: number
    days: ItineraryDay[]
    onClose: () => void
    onApplied: (days: ItineraryDay[]) => void
}

const REPLAN_REASONS = [
    {
        key: 'ROUTE_OPTIMIZATION',
        label: '동선 최적화',
        hint: '선택 범위 안에서 이동 순서 개선',
    },
    {
        key: 'BUSINESS_HOURS',
        label: '영업시간 변경',
        hint: 'Google 운영시간 재확인',
    },
    { key: 'WEATHER', label: '날씨 문제', hint: '최소 60분 뒤로 조정' },
    {
        key: 'TEMPORARY_CLOSURE',
        label: '임시 휴무',
        hint: 'Google 영업 상태 재확인',
    },
    { key: 'SCHEDULE_DELAY', label: '일정 지연', hint: '최소 30분 뒤로 조정' },
    {
        key: 'USER_REPORTED_CROWD',
        label: '현장 혼잡',
        hint: '직접 확인 · 최소 60분 조정',
    },
    { key: 'FATIGUE', label: '체력·컨디션', hint: '최소 30분 여유 반영' },
] as const

type ReplanReasonKey = (typeof REPLAN_REASONS)[number]['key']
type ReplanScope = 'SINGLE_DAY' | 'REMAINING_DAYS'

function localDateValue(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function localTimeValue(date: Date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function isRemainingItem(
    itineraryDate: string,
    item: ItineraryItem,
    now: Date,
) {
    const today = localDateValue(now)
    if (itineraryDate < today) return false
    if (itineraryDate > today) return true
    const cutoff = item.endTime ?? item.startTime
    return cutoff == null || cutoff.slice(0, 5) > localTimeValue(now)
}

function formatDistance(meters: number) {
    return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`
}

function ReplanPreview({
    plan,
    affectedTripPlaceIds,
}: {
    plan: RoutePlanPreview
    affectedTripPlaceIds: Set<number>
}) {
    const affectedDays = plan.days
        .map((day) => ({
            ...day,
            items: day.items.filter((item) =>
                affectedTripPlaceIds.has(item.tripPlaceId),
            ),
        }))
        .filter((day) => day.items.length > 0)
    const affectedPlaceCount = affectedDays.reduce(
        (count, day) => count + day.items.length,
        0,
    )
    const affectedDistanceMeters = affectedDays.reduce(
        (distance, day) => distance + day.totalDistanceMeters,
        0,
    )
    return (
        <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-r from-rose-50 to-pink-50 p-4">
                <p className="text-xs font-bold leading-5 text-rose-700">
                    {plan.summary}
                </p>
                <div className="mt-2 flex gap-2 text-[10px] font-extrabold text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1">
                        재배치 장소 {affectedPlaceCount}곳
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1">
                        예상 이동 {formatDistance(affectedDistanceMeters)}
                    </span>
                </div>
            </div>
            {affectedDays.map((day) => (
                <section
                    key={day.dayId}
                    className="rounded-2xl border border-slate-200 bg-white p-3.5"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-black text-brand">
                            Day {day.dayNumber}
                            <span className="ml-2 font-medium text-slate-400">
                                {day.itineraryDate}
                            </span>
                        </p>
                        <span className="text-[10px] font-bold text-slate-400">
                            {formatDistance(day.totalDistanceMeters)}
                        </span>
                    </div>
                    {day.items.map((item, index) => (
                        <div key={`${day.dayId}-${item.tripPlaceId}`}>
                            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-extrabold text-slate-800">
                                            {item.placeName}
                                        </p>
                                        <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">
                                            {item.reason}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-bold text-slate-500">
                                        {item.startTime && item.endTime
                                            ? `${item.startTime}–${item.endTime}`
                                            : '시간 미정'}
                                    </span>
                                </div>
                            </div>
                            {index < day.items.length - 1 && (
                                <div className="flex items-center gap-1 py-1.5 pl-3 text-[10px] text-slate-400">
                                    <ArrowDownIcon size={11} />
                                    {item.transportMinutes ?? 0}분 ·{' '}
                                    {formatDistance(item.transportMeters ?? 0)}
                                </div>
                            )}
                        </div>
                    ))}
                </section>
            ))}
        </div>
    )
}

export function AiItineraryReplanModal({
    tripId,
    days,
    onClose,
    onApplied,
}: Props) {
    const [openedAt] = useState(() => new Date())
    const [scope, setScope] = useState<ReplanScope>('SINGLE_DAY')
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
    const [selectedReason, setSelectedReason] =
        useState<ReplanReasonKey>('ROUTE_OPTIMIZATION')
    const [options, setOptions] = useState<RouteOption[]>([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [loading, setLoading] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [applying, setApplying] = useState(false)
    const [applied, setApplied] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const displayDays = useMemo(
        () =>
            days
                .map((day) => ({
                    ...day,
                    items: day.items.filter(
                        (item) =>
                            item.tripPlaceId !== null &&
                            Number(item.tripPlaceId) !==
                                day.departure?.tripPlaceId,
                    ),
                }))
                .filter((day) => day.items.length > 0),
        [days],
    )
    const [selectedDayId, setSelectedDayId] = useState(() =>
        String(
            days.find(
                (day) =>
                    day.items.filter(
                        (item) =>
                            item.tripPlaceId !== null &&
                            Number(item.tripPlaceId) !==
                                day.departure?.tripPlaceId &&
                            isRemainingItem(day.itineraryDate, item, openedAt),
                    ).length >= 2,
            )?.id ?? '',
        ),
    )
    const selectedDisplayDay =
        displayDays.find((day) => String(day.id) === selectedDayId) ??
        displayDays[0] ??
        null
    const selectedDayValue =
        selectedDisplayDay == null ? '' : String(selectedDisplayDay.id)
    const dayOptions = displayDays.map((day) => ({
        value: String(day.id),
        label: `Day ${day.dayNumber} · ${day.itineraryDate} · ${day.items.length}개 일정`,
    }))
    const remainingItems = useMemo(
        () =>
            displayDays.flatMap((day) =>
                day.items.filter((item) =>
                    isRemainingItem(day.itineraryDate, item, openedAt),
                ),
            ),
        [displayDays, openedAt],
    )
    const selectedDayRemainingItems = useMemo(
        () =>
            selectedDisplayDay?.items.filter((item) =>
                isRemainingItem(
                    selectedDisplayDay.itineraryDate,
                    item,
                    openedAt,
                ),
            ) ?? [],
        [openedAt, selectedDisplayDay],
    )
    const selectedItemIndex = remainingItems.findIndex(
        (item) => Number(item.id) === selectedItemId,
    )
    const affectedTripPlaceIds = useMemo(() => {
        const affectedItems =
            scope === 'SINGLE_DAY'
                ? selectedDayRemainingItems
                : selectedItemIndex < 0
                  ? []
                  : remainingItems.slice(selectedItemIndex)
        return new Set(
            affectedItems
                .map((item) => Number(item.tripPlaceId))
                .filter(Number.isFinite),
        )
    }, [remainingItems, scope, selectedDayRemainingItems, selectedItemIndex])
    const selectedPlan = options[selectedIndex]?.plan ?? null
    const canPreview =
        selectedReason !== null &&
        (scope === 'SINGLE_DAY'
            ? selectedDisplayDay !== null &&
              selectedDayRemainingItems.length >= 2
            : selectedItemId !== null)

    function resetPreview() {
        setOptions([])
        setSelectedIndex(0)
        setShowSuccess(false)
        setApplied(false)
    }

    function selectStartingItem(itemId: number) {
        setSelectedItemId(itemId)
        resetPreview()
        setError(null)
    }

    function selectReason(reason: ReplanReasonKey) {
        setSelectedReason(reason)
        resetPreview()
        setError(null)
    }

    async function preview() {
        if (!canPreview || selectedReason === null) {
            setError(
                scope === 'SINGLE_DAY'
                    ? '장소가 2곳 이상 남은 Day와 변경 사유를 선택해 주세요.'
                    : '재배치를 시작할 일정과 변경 사유를 선택해 주세요.',
            )
            return
        }
        setLoading(true)
        setShowSuccess(false)
        setApplied(false)
        setError(null)
        try {
            const result = await previewAiItineraryReplan(
                tripId,
                scope === 'SINGLE_DAY'
                    ? {
                          scope,
                          dayId: Number(selectedDisplayDay?.id),
                          reasons: [selectedReason],
                      }
                    : {
                          scope,
                          itineraryItemId: selectedItemId as number,
                          reasons: [selectedReason],
                      },
            )
            setOptions(result)
            setSelectedIndex(0)
            setShowSuccess(true)
        } catch (requestError) {
            setError(
                getApiErrorMessage(
                    requestError,
                    '남은 일정 재배치안을 만들지 못했습니다.',
                ),
            )
        } finally {
            setLoading(false)
        }
    }

    async function apply() {
        if (!selectedPlan) return
        setApplying(true)
        setError(null)
        try {
            const updatedDays = await applyAiItineraryReplan(
                tripId,
                selectedPlan,
                scope === 'SINGLE_DAY'
                    ? Number(selectedDisplayDay?.id)
                    : undefined,
            )
            onApplied(updatedDays)
            setApplied(true)
        } catch (requestError) {
            setError(
                getApiErrorMessage(
                    requestError,
                    '재배치안을 일정에 반영하지 못했습니다.',
                ),
            )
        } finally {
            setApplying(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <section className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_28px_80px_rgb(var(--rgb-app-ink)/0.24)]">
                {applying && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/85 text-center backdrop-blur-sm">
                        <AnalysisStatusAnimation phase="loading" />
                        <p className="text-sm font-extrabold text-slate-700">
                            선택한 재배치안을 일정에 반영하고 있어요
                        </p>
                    </div>
                )}
                <header className="flex items-start justify-between gap-4 bg-gradient-to-br from-[var(--color-brand-surface-soft)] via-white to-[var(--color-brand-surface-subtle)] px-6 py-5">
                    <div className="flex min-w-0 items-start gap-4">
                        <AiBrandMark />
                        <div className="pt-1">
                            <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-brand shadow-sm">
                                PLAMINGO AI
                            </span>
                            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">
                                일정 다시 배치하기
                            </h2>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                                선택한 하루만 정리하거나, 특정 일정 이후를 다시
                                구성할 수 있어요.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="일정 재배치 닫기"
                        className="rounded-xl border border-white bg-white/80 p-2 text-slate-400 shadow-sm hover:text-slate-700"
                    >
                        <XIcon size={18} />
                    </button>
                </header>

                <div className="mp-scroll flex-1 overflow-y-auto px-6 py-5">
                    {options.length === 0 && !loading && (
                        <div>
                            <div className="mb-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                                <button
                                    type="button"
                                    aria-pressed={scope === 'SINGLE_DAY'}
                                    onClick={() => {
                                        setScope('SINGLE_DAY')
                                        setSelectedItemId(null)
                                        resetPreview()
                                        setError(null)
                                    }}
                                    className={`rounded-xl px-3 py-3 text-xs font-extrabold transition ${scope === 'SINGLE_DAY' ? 'bg-white text-brand shadow-sm' : 'text-slate-500'}`}
                                >
                                    선택한 하루만
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={scope === 'REMAINING_DAYS'}
                                    onClick={() => {
                                        setScope('REMAINING_DAYS')
                                        setSelectedItemId(null)
                                        resetPreview()
                                        setError(null)
                                    }}
                                    className={`rounded-xl px-3 py-3 text-xs font-extrabold transition ${scope === 'REMAINING_DAYS' ? 'bg-white text-brand shadow-sm' : 'text-slate-500'}`}
                                >
                                    이후 일정 전체
                                </button>
                            </div>
                            <div className="grid gap-6 md:grid-cols-[1.25fr_0.75fr]">
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-800">
                                                {scope === 'SINGLE_DAY'
                                                    ? '재배치할 Day 선택'
                                                    : '재배치 시작 일정 선택'}
                                            </h3>
                                            <p className="mt-1 text-[11px] text-slate-400">
                                                {scope === 'SINGLE_DAY'
                                                    ? '선택한 Day 안에서만 장소 순서와 시간을 다시 계산합니다.'
                                                    : '선택한 일정부터 이후 일정 전체를 다시 배치합니다.'}
                                            </p>
                                        </div>
                                        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black text-brand">
                                            {scope === 'SINGLE_DAY'
                                                ? selectedDayRemainingItems.length >=
                                                  2
                                                    ? 'Day 선택됨'
                                                    : '장소 2곳 필요'
                                                : selectedItemId === null
                                                  ? '선택 필요'
                                                  : '시작점 선택됨'}
                                        </span>
                                    </div>

                                    <div className="mt-3 space-y-3">
                                        {displayDays.length === 0 ? (
                                            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-xs font-bold text-slate-400">
                                                재배치할 수 있는 남은 일정이
                                                없습니다.
                                            </div>
                                        ) : (
                                            <section className="rounded-2xl border border-slate-200 p-3">
                                                <Select
                                                    aria-label="재배치 일자 선택"
                                                    value={selectedDayValue}
                                                    options={dayOptions}
                                                    onChange={(value) => {
                                                        setSelectedDayId(value)
                                                        setSelectedItemId(null)
                                                        resetPreview()
                                                        setError(null)
                                                    }}
                                                    variant="form"
                                                    className="w-full"
                                                    menuClassName="font-semibold"
                                                />
                                                {selectedDisplayDay &&
                                                    scope ===
                                                        'REMAINING_DAYS' && (
                                                        <div className="mp-scroll mt-3 grid max-h-[228px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                                                            {selectedDisplayDay.items.map(
                                                                (item) => {
                                                                    const itemId =
                                                                        Number(
                                                                            item.id,
                                                                        )
                                                                    const selectable =
                                                                        isRemainingItem(
                                                                            selectedDisplayDay.itineraryDate,
                                                                            item,
                                                                            openedAt,
                                                                        )
                                                                    const selected =
                                                                        selectedItemId ===
                                                                        itemId
                                                                    return (
                                                                        <button
                                                                            key={
                                                                                item.id
                                                                            }
                                                                            type="button"
                                                                            disabled={
                                                                                !selectable
                                                                            }
                                                                            onClick={() =>
                                                                                selectStartingItem(
                                                                                    itemId,
                                                                                )
                                                                            }
                                                                            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${!selectable ? 'cursor-not-allowed border-slate-100 bg-slate-100/80 opacity-55 grayscale' : selected ? 'border-brand bg-rose-50' : 'border-slate-200 hover:border-rose-200'}`}
                                                                        >
                                                                            <span
                                                                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white'}`}
                                                                            >
                                                                                {selected && (
                                                                                    <CheckIcon
                                                                                        size={
                                                                                            13
                                                                                        }
                                                                                    />
                                                                                )}
                                                                            </span>
                                                                            <span className="min-w-0 flex-1">
                                                                                <span className="block truncate text-xs font-extrabold text-slate-700">
                                                                                    {item.placeName ??
                                                                                        '이름 없는 일정'}
                                                                                </span>
                                                                                <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                                                                                    <Clock3Icon
                                                                                        size={
                                                                                            11
                                                                                        }
                                                                                    />
                                                                                    {item.startTime ??
                                                                                        '시간 미정'}
                                                                                    {!selectable &&
                                                                                        ' · 지난 일정'}
                                                                                </span>
                                                                            </span>
                                                                        </button>
                                                                    )
                                                                },
                                                            )}
                                                        </div>
                                                    )}
                                                {selectedDisplayDay &&
                                                    scope === 'SINGLE_DAY' && (
                                                        <div className="mt-3 rounded-xl bg-slate-50 p-3">
                                                            <p className="text-[11px] font-extrabold text-slate-700">
                                                                남은 장소{' '}
                                                                {
                                                                    selectedDayRemainingItems.length
                                                                }
                                                                곳을 이 Day
                                                                안에서만
                                                                재배치합니다.
                                                            </p>
                                                            <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                                                다른 Day의
                                                                장소·순서·출발지는
                                                                변경되지
                                                                않습니다.
                                                            </p>
                                                        </div>
                                                    )}
                                                {selectedDisplayDay &&
                                                    scope ===
                                                        'REMAINING_DAYS' &&
                                                    selectedDisplayDay.items
                                                        .length > 6 && (
                                                        <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">
                                                            아래로 스크롤해
                                                            나머지 일정을
                                                            확인하세요.
                                                        </p>
                                                    )}
                                            </section>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-black text-slate-800">
                                        변경 사유
                                    </h3>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                        가장 중요한 변경 사유 하나를 선택해
                                        주세요.
                                    </p>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {REPLAN_REASONS.map((reason) => {
                                            const selected =
                                                selectedReason === reason.key
                                            return (
                                                <button
                                                    key={reason.key}
                                                    type="button"
                                                    onClick={() =>
                                                        selectReason(reason.key)
                                                    }
                                                    aria-pressed={selected}
                                                    className={`flex min-h-16 flex-col justify-center rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-brand bg-brand text-white shadow-[0_6px_16px_rgb(var(--rgb-brand-shadow)/0.2)]' : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50/40'}`}
                                                >
                                                    <span className="block text-xs font-extrabold leading-4">
                                                        {reason.label}
                                                    </span>
                                                    <span
                                                        className={`mt-1 block text-[9px] font-semibold leading-3.5 ${selected ? 'text-white/80' : 'text-slate-400'}`}
                                                    >
                                                        {reason.hint}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                                        <AlertTriangleIcon
                                            size={20}
                                            className="text-amber-500"
                                        />
                                        <p className="mt-2 text-xs font-extrabold text-slate-700">
                                            {scope === 'SINGLE_DAY'
                                                ? '다른 Day는 그대로 유지됩니다.'
                                                : '선택한 일정 이전은 그대로 유지됩니다.'}
                                        </p>
                                        <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                            {scope === 'SINGLE_DAY'
                                                ? '이미 지난 일정은 고정하고, 선택한 Day의 남은 장소만 다시 계산합니다.'
                                                : '선택한 장소를 이후 시간대에 다시 넣을 수 있으며, 해당 일정부터 모든 후속 동선을 다시 계산합니다.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading && !showSuccess && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center">
                            <AnalysisStatusAnimation phase="loading" />
                            <p className="text-sm font-bold text-slate-600">
                                선택한 일정과 변경 사유를 분석하고 있어요.
                            </p>
                        </div>
                    )}

                    {showSuccess && !loading && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center">
                            <AnalysisStatusAnimation
                                phase="complete"
                                onComplete={() => setShowSuccess(false)}
                            />
                            <p className="text-sm font-bold text-slate-600">
                                분석이 완료됐어요
                            </p>
                        </div>
                    )}

                    {options.length > 0 && !loading && !showSuccess && (
                        <div className="space-y-4">
                            <div className="mp-scroll flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
                                {options.map((option, index) => (
                                    <button
                                        key={`${option.routeLabel}-${index}`}
                                        type="button"
                                        onClick={() => {
                                            setSelectedIndex(index)
                                            setApplied(false)
                                        }}
                                        className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold transition ${selectedIndex === index ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        {option.routeLabel}
                                    </button>
                                ))}
                            </div>
                            {selectedPlan && (
                                <ReplanPreview
                                    plan={selectedPlan}
                                    affectedTripPlaceIds={affectedTripPlaceIds}
                                />
                            )}
                        </div>
                    )}

                    {error && (
                        <p
                            role="alert"
                            className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
                        >
                            {error}
                        </p>
                    )}
                </div>

                <footer className="border-t border-slate-100 p-5">
                    {!showSuccess && applied ? (
                        <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-3 text-sm font-extrabold text-emerald-600">
                            <AnalysisStatusAnimation
                                phase="complete"
                                size={32}
                            />
                            일정에 반영했습니다
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={
                                loading ||
                                showSuccess ||
                                applying ||
                                !canPreview
                            }
                            onClick={() =>
                                selectedPlan ? void apply() : void preview()
                            }
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-[var(--color-brand-gradient-end)] py-3.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgb(var(--rgb-brand-shadow)/0.28)] disabled:opacity-50"
                        >
                            {(loading || applying) && (
                                <LoaderCircleIcon
                                    className="animate-spin"
                                    size={16}
                                />
                            )}
                            <RouteIcon size={16} />
                            {selectedPlan
                                ? applying
                                    ? '일정 반영 중이에요'
                                    : '선택한 재배치안 적용하기'
                                : loading
                                  ? '재배치안 생성 중이에요'
                                  : '재배치안 미리보기'}
                        </button>
                    )}
                </footer>
            </section>
        </div>
    )
}
