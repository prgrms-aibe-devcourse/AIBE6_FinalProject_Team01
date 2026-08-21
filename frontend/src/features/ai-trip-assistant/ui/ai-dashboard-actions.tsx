'use client'

import { useRef, useState, type ReactNode } from 'react'
import {
    ArrowRightIcon,
    Clock3Icon,
    LoaderCircleIcon,
    MapPinnedIcon,
    RouteIcon,
    XIcon,
} from 'lucide-react'
import type { ItineraryDay } from '@/entities/trip'
import { PLACE_SEARCH_CATEGORIES } from '@/features/search-place'
import { getApiErrorMessage } from '@/shared/api/client'
import { globalModal } from '@/shared/model'
import { AnalysisStatusAnimation, Select } from '@/shared/ui'
import { recommendPlacesAlongRoute } from '../api/ai-trip-api'
import type { AiPlaceRecommendation } from '../model/types'
import { AiBrandMark } from './ai-brand-mark'
import { AiItineraryReplanModal } from './ai-itinerary-replan-modal'
import { AiPlaceRecommendationResults } from './ai-place-recommendation-results'

type Props = {
    tripId: number
    days: ItineraryDay[]
    startDate: string | null
    endDate: string | null
    selectedDayId: number | null
    onReplanApplied: (days: ItineraryDay[]) => void
    renderRecommendationMap: (
        recommendation: AiPlaceRecommendation,
        context: {
            dayId: number
            dayNumber: number
            itineraryDate: string
            from: ItineraryDay['items'][number] | null
            to: ItineraryDay['items'][number] | null
        },
    ) => ReactNode
}

const categories = PLACE_SEARCH_CATEGORIES.filter(
    (category) => category.key !== 'all' && category.key !== 'transit_station',
)

const categorySearchQueries: Record<string, string> = {
    lodging: 'hotel',
    tourist_attraction: 'tourist attractions',
    restaurant: 'restaurant',
    cafe: 'cafe',
    shopping_mall: 'shopping',
}

function localDateValue(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function localTimeValue(date: Date) {
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${hour}:${minute}`
}

function isUpcomingSegment(
    itineraryDate: string,
    destinationStartTime: string | null,
    referenceTime: Date | null,
) {
    if (!referenceTime) return true
    const today = localDateValue(referenceTime)
    if (itineraryDate < today) return false
    if (itineraryDate > today || !destinationStartTime) return true
    return destinationStartTime.slice(0, 5) > localTimeValue(referenceTime)
}

export function AiDashboardActions({
    tripId,
    days,
    startDate,
    endDate,
    selectedDayId,
    onReplanApplied,
    renderRecommendationMap,
}: Props) {
    const [mode, setMode] = useState<'place' | 'replan' | null>(null)
    const [category, setCategory] = useState(categories[0].key)
    const [prompt, setPrompt] = useState('')
    const [selectedSegmentKey, setSelectedSegmentKey] = useState<string | null>(
        null,
    )
    const [selectedRouteDayId, setSelectedRouteDayId] = useState<number | null>(
        selectedDayId,
    )
    const [recommendationReferenceTime, setRecommendationReferenceTime] =
        useState<Date | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [emptyResult, setEmptyResult] = useState(false)
    const [recommendations, setRecommendations] = useState<
        AiPlaceRecommendation[]
    >([])
    const recommendationRequestId = useRef(0)
    const recommendationSubmitting = useRef(false)
    const routeSegments = days.flatMap((day) => {
        const orderedItems = [...day.items]
            .filter(
                (item): item is typeof item & { tripPlaceId: string } =>
                    item.tripPlaceId !== null,
            )
            .sort((first, second) => first.sortOrder - second.sortOrder)
        if (orderedItems.length === 0) return []
        const betweenSegments = orderedItems.slice(0, -1).map((from, index) => {
            const to = orderedItems[index + 1]
            return {
                key: `${day.id}:${from.tripPlaceId}:${to.tripPlaceId}`,
                dayId: Number(day.id),
                dayNumber: day.dayNumber,
                itineraryDate: day.itineraryDate,
                segmentNumber: index + 1,
                from,
                to,
            }
        })
        return [
            {
                key: `${day.id}:before:${orderedItems[0].tripPlaceId}`,
                dayId: Number(day.id),
                dayNumber: day.dayNumber,
                itineraryDate: day.itineraryDate,
                segmentNumber: 0,
                from: null,
                to: orderedItems[0],
            },
            ...betweenSegments,
            {
                key: `${day.id}:${orderedItems.at(-1)!.tripPlaceId}:after`,
                dayId: Number(day.id),
                dayNumber: day.dayNumber,
                itineraryDate: day.itineraryDate,
                segmentNumber: orderedItems.length,
                from: orderedItems.at(-1)!,
                to: null,
            },
        ].filter((segment) =>
            isUpcomingSegment(
                segment.itineraryDate,
                (segment.to ?? segment.from)?.startTime ?? null,
                recommendationReferenceTime,
            ),
        )
    })
    const routeDays = Array.from(
        new Map(
            routeSegments.map((segment) => [
                segment.dayId,
                {
                    dayId: segment.dayId,
                    dayNumber: segment.dayNumber,
                    itineraryDate: segment.itineraryDate,
                },
            ]),
        ).values(),
    )
    const activeRouteDayId = routeDays.some(
        (day) => day.dayId === selectedRouteDayId,
    )
        ? selectedRouteDayId
        : routeDays.some((day) => day.dayId === selectedDayId)
          ? selectedDayId
          : (routeDays[0]?.dayId ?? null)
    const visibleRouteSegments = routeSegments.filter(
        (segment) => segment.dayId === activeRouteDayId,
    )
    const routeDayOptions = routeDays.map((day) => ({
        value: String(day.dayId),
        label: `Day ${day.dayNumber} · ${day.itineraryDate} · ${routeSegments.filter((segment) => segment.dayId === day.dayId).length}개 구간`,
    }))
    const defaultSegment = visibleRouteSegments[0]
    const selectedSegment =
        routeSegments.find((segment) => segment.key === selectedSegmentKey) ??
        defaultSegment

    function openItineraryReplan() {
        const today = localDateValue(new Date())
        if (
            startDate === null ||
            endDate === null ||
            today < startDate ||
            today > endDate
        ) {
            globalModal.open({
                title: '여행 중에만 사용할 수 있어요',
                description: '여행 시작일부터 종료일까지 사용할 수 있습니다.',
                confirmText: '확인',
            })
            return
        }
        setMode('replan')
        setError(null)
    }

    async function submitPlaceRecommendation() {
        if (recommendationSubmitting.current) return
        if (!selectedSegment) {
            setError('장소가 2개 이상 배치된 Day에서 동선을 선택해 주세요.')
            return
        }
        const currentRequestId = ++recommendationRequestId.current
        recommendationSubmitting.current = true
        setLoading(true)
        setError(null)
        setEmptyResult(false)
        try {
            const recommendations = await recommendPlacesAlongRoute(tripId, {
                dayId: selectedSegment.dayId,
                fromTripPlaceId: selectedSegment.from
                    ? Number(selectedSegment.from.tripPlaceId)
                    : null,
                toTripPlaceId: selectedSegment.to
                    ? Number(selectedSegment.to.tripPlaceId)
                    : null,
                category: categorySearchQueries[category] ?? category,
                prompt,
                limit: 5,
            })
            if (recommendationRequestId.current !== currentRequestId) return
            if (recommendations.length === 0) {
                setEmptyResult(true)
                return
            }
            setRecommendations(recommendations.slice(0, 5))
        } catch (requestError) {
            if (recommendationRequestId.current !== currentRequestId) return
            setError(
                getApiErrorMessage(
                    requestError,
                    'AI 장소 추천을 불러오지 못했습니다.',
                ),
            )
        } finally {
            if (recommendationRequestId.current === currentRequestId) {
                recommendationSubmitting.current = false
                setLoading(false)
            }
        }
    }

    function openPlaceRecommendation() {
        recommendationRequestId.current += 1
        recommendationSubmitting.current = false
        setMode('place')
        setPrompt('')
        setSelectedSegmentKey(null)
        setSelectedRouteDayId(selectedDayId)
        setRecommendationReferenceTime(new Date())
        setLoading(false)
        setError(null)
        setEmptyResult(false)
        setRecommendations([])
    }

    function closePlaceRecommendation() {
        recommendationRequestId.current += 1
        recommendationSubmitting.current = false
        setLoading(false)
        setMode(null)
    }

    return (
        <>
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={openPlaceRecommendation}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--background-trip-selector)] px-3 py-2 text-xs font-extrabold text-[var(--color-trip-selector)] transition hover:brightness-95"
                >
                    <MapPinnedIcon size={15} />
                    AI 장소 추천
                </button>
                <button
                    type="button"
                    onClick={openItineraryReplan}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--background-strong-action)] px-3 py-2 text-xs font-extrabold text-[var(--color-strong-action-text)] transition hover:brightness-110"
                >
                    <RouteIcon size={15} />
                    일정 재배치
                </button>
            </div>

            {mode === 'place' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[5px]">
                    <section
                        className={`relative w-full overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_28px_80px_rgb(var(--rgb-app-ink)/0.22)] ${recommendations.length > 0 ? 'max-w-5xl' : 'max-w-4xl'}`}
                    >
                        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand/10 blur-3xl" />
                        <header className="relative flex items-start justify-between gap-4 bg-gradient-to-br from-[var(--color-brand-surface-soft)] via-white to-[var(--color-brand-surface-subtle)] px-6 pb-5 pt-6">
                            <div className="flex min-w-0 items-start gap-4">
                                <AiBrandMark />
                                <div className="pt-1">
                                    <span className="inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-brand shadow-sm">
                                        PLAMINGO AI
                                    </span>
                                    <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">
                                        동선 주변 장소 추천
                                    </h2>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                        첫 장소 이전·장소 사이·마지막 장소
                                        이후의 실제 장소를 추천해요.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closePlaceRecommendation}
                                className="rounded-xl border border-white bg-white/80 p-2 text-slate-400 shadow-sm transition hover:bg-white hover:text-slate-700"
                                aria-label="AI 기능 창 닫기"
                            >
                                <XIcon size={18} />
                            </button>
                        </header>

                        {loading && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/85 text-center backdrop-blur-sm">
                                <AnalysisStatusAnimation phase="loading" />
                                <p className="text-sm font-extrabold text-slate-700">
                                    동선과 취향을 분석하고 있어요
                                </p>
                                <p className="text-xs text-slate-400">
                                    조건에 맞는 장소를 찾는 중입니다.
                                </p>
                            </div>
                        )}

                        {recommendations.length > 0 ? (
                            <AiPlaceRecommendationResults
                                tripId={tripId}
                                recommendations={recommendations}
                                routeContext={{
                                    dayId: selectedSegment.dayId,
                                    dayNumber: selectedSegment.dayNumber,
                                    itineraryDate:
                                        selectedSegment.itineraryDate,
                                    from: selectedSegment.from,
                                    to: selectedSegment.to,
                                }}
                                renderMap={renderRecommendationMap}
                                onReset={() => {
                                    setRecommendations([])
                                    setError(null)
                                    setEmptyResult(false)
                                }}
                            />
                        ) : (
                            <div className="relative px-6 pb-6 pt-5">
                                <div>
                                    <div className="flex items-end justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-extrabold text-slate-700">
                                                어느 동선 사이를 추천할까요?
                                            </p>
                                            <p className="mt-1 text-[11px] text-slate-400">
                                                전체 일정의 연속된 장소 구간을
                                                모아봤어요.
                                            </p>
                                        </div>
                                        <span className="text-[10px] font-bold text-rose-500">
                                            필수 선택
                                        </span>
                                    </div>

                                    {routeSegments.length > 0 ? (
                                        <div className="mt-3 rounded-2xl border border-slate-200 p-3">
                                            <Select
                                                aria-label="장소 추천 Day 선택"
                                                value={String(
                                                    activeRouteDayId ?? '',
                                                )}
                                                options={routeDayOptions}
                                                onChange={(value) => {
                                                    setSelectedRouteDayId(
                                                        Number(value),
                                                    )
                                                    setSelectedSegmentKey(null)
                                                    setError(null)
                                                    setEmptyResult(false)
                                                }}
                                                variant="form"
                                                className="w-full"
                                            />
                                            <div className="mp-scroll mt-3 grid max-h-[268px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                                                {visibleRouteSegments.map(
                                                    (segment) => {
                                                        const isSelected =
                                                            selectedSegment?.key ===
                                                            segment.key
                                                        return (
                                                            <button
                                                                key={
                                                                    segment.key
                                                                }
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedSegmentKey(
                                                                        segment.key,
                                                                    )
                                                                    setError(
                                                                        null,
                                                                    )
                                                                    setEmptyResult(
                                                                        false,
                                                                    )
                                                                }}
                                                                className={`w-full rounded-2xl border p-3 text-left transition ${
                                                                    isSelected
                                                                        ? 'border-brand bg-brand-50 shadow-[0_6px_18px_rgb(var(--rgb-brand-shadow)/0.12)]'
                                                                        : 'border-slate-200 bg-white hover:border-brand-200'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                                                                            isSelected
                                                                                ? 'bg-brand text-white'
                                                                                : 'bg-slate-100 text-slate-500'
                                                                        }`}
                                                                    >
                                                                        {
                                                                            segment.dayNumber
                                                                        }
                                                                    </span>
                                                                    <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-slate-700">
                                                                        {segment
                                                                            .from
                                                                            ?.placeName ??
                                                                            '첫 장소 이전'}
                                                                    </span>
                                                                    <ArrowRightIcon
                                                                        className="shrink-0 text-brand"
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                    <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-slate-700">
                                                                        {segment
                                                                            .to
                                                                            ?.placeName ??
                                                                            '마지막 장소 이후'}
                                                                    </span>
                                                                </div>
                                                                <div className="mt-2 flex items-center gap-1 pl-8 text-[10px] font-medium text-slate-400">
                                                                    <Clock3Icon
                                                                        size={
                                                                            11
                                                                        }
                                                                    />
                                                                    Day{' '}
                                                                    {
                                                                        segment.dayNumber
                                                                    }{' '}
                                                                    · 구간{' '}
                                                                    {
                                                                        segment.segmentNumber
                                                                    }{' '}
                                                                    ·{' '}
                                                                    {
                                                                        segment.itineraryDate
                                                                    }{' '}
                                                                    ·{' '}
                                                                    {segment
                                                                        .from
                                                                        ?.startTime ??
                                                                        '시간 미정'}{' '}
                                                                    →{' '}
                                                                    {segment.to
                                                                        ?.startTime ??
                                                                        '시간 미정'}
                                                                </div>
                                                            </button>
                                                        )
                                                    },
                                                )}
                                            </div>
                                            {visibleRouteSegments.length >
                                                6 && (
                                                <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">
                                                    아래로 스크롤해 나머지
                                                    동선을 확인하세요.
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="mt-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-4 text-center">
                                            <p className="text-xs font-bold text-amber-700">
                                                선택한 Day에 장소를 2개 이상
                                                먼저 배치해 주세요.
                                            </p>
                                            <p className="mt-1 text-[10px] text-amber-600">
                                                연속된 두 장소가 있어야 중간
                                                추천 구간을 만들 수 있어요.
                                            </p>
                                        </div>
                                    )}

                                    <div className="my-5 h-px bg-slate-100" />
                                </div>
                                <div>
                                    <p className="mb-2 text-xs font-extrabold text-slate-600">
                                        어떤 장소가 필요하세요?
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {categories.map((item) => (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => {
                                                    setCategory(item.key)
                                                    setEmptyResult(false)
                                                }}
                                                className={`rounded-full px-3 py-2 text-xs font-bold transition ${
                                                    category === item.key
                                                        ? 'bg-brand text-white shadow-[0_6px_16px_rgb(var(--rgb-brand-shadow)/0.25)]'
                                                        : 'border border-slate-200 bg-white text-slate-500 hover:border-brand-200 hover:bg-brand-50'
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <label className="mt-5 block text-xs font-extrabold text-slate-600">
                                    원하는 분위기나 취향
                                    <textarea
                                        value={prompt}
                                        onChange={(event) => {
                                            setPrompt(event.target.value)
                                            setEmptyResult(false)
                                        }}
                                        maxLength={500}
                                        rows={4}
                                        placeholder="예: 진한 돈코츠 라멘을 좋아하고 너무 비싸지 않았으면 좋겠어"
                                        className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium leading-6 outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
                                    />
                                </label>

                                {error && (
                                    <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                                        {error}
                                    </p>
                                )}

                                {emptyResult && (
                                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                                        <p className="text-xs font-extrabold text-amber-700">
                                            선택한 동선과 조건에 맞는 장소를
                                            찾지 못했어요.
                                        </p>
                                        <p className="mt-1 text-[11px] leading-5 text-amber-600">
                                            다른 동선이나 카테고리를 선택하거나
                                            검색 조건을 조금 넓혀 다시 시도해
                                            주세요.
                                        </p>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    disabled={
                                        loading || routeSegments.length === 0
                                    }
                                    onClick={() =>
                                        void submitPlaceRecommendation()
                                    }
                                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-[var(--color-brand-gradient-end)] py-3.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgb(var(--rgb-brand-shadow)/0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgb(var(--rgb-brand-shadow)/0.34)] disabled:translate-y-0 disabled:opacity-50"
                                >
                                    {loading && (
                                        <LoaderCircleIcon
                                            className="animate-spin"
                                            size={16}
                                        />
                                    )}
                                    {loading
                                        ? '동선과 취향을 분석하고 있어요'
                                        : '장소 추천 받기'}
                                </button>
                            </div>
                        )}
                    </section>
                </div>
            )}
            {mode === 'replan' && (
                <AiItineraryReplanModal
                    tripId={tripId}
                    days={days}
                    onClose={() => setMode(null)}
                    onApplied={onReplanApplied}
                />
            )}
        </>
    )
}
