import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
    BookmarkIcon,
    CheckCircle2Icon,
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    CreditCardIcon,
    EllipsisVerticalIcon,
    MapIcon,
    MessageCircleIcon,
    PlaneIcon,
    PlusIcon,
    ThumbsUpIcon,
} from 'lucide-react'

import { motion } from 'framer-motion'
import { type Place } from '@/entities/trip'
import { ExpensePanel, fetchExpenseData } from '@/features/manage-expense'
import { CreateTripModal, useTripStore } from '@/features/manage-trip'
import { AiDashboardActions } from '@/features/ai-trip-assistant'
import { NotificationPanel } from '@/features/manage-notification'
import { useActivityLogStore } from '@/features/view-activity-log'
import { resolveMediaUrl } from '@/shared/api/client'
import { useCurrentUserStore } from '@/shared/model'
import { Avatar } from '@/shared/ui'
import { KanbanMapPanel } from '@/widgets/trip-room'
import { TravelRooms } from '@/widgets/travel-rooms'
import {
    addMonths,
    createCalendarDays,
    currency,
    formatTripDateRange,
    getDefaultDashboardDate,
    getOriginCode,
    getTicketDestinationCode,
    getTripCountdownLabel,
    getTripStatusLabel,
    isDestinationSet,
    isTripDate,
    parseLocalDate,
    startOfMonth,
    toDateKey,
} from '../model/dashboard-helpers'
import { useDashboardData } from '../model/use-dashboard-data'

const PUBLIC_CARD_STYLE_LABELS: Record<string, string> = {
    ACTIVITY: '액티비티',
    SNS_HOT_PLACE: 'SNS 핫플레이스',
    NATURE: '자연과 함께',
    FAMOUS_ATTRACTIONS: '유명관광지 필수',
    RELAXATION: '여유롭게 힐링',
    CULTURE_ART_HISTORY: '문화/예술/역사',
    SHOPPING: '쇼핑',
    FOOD: '맛집 먹거리',
}

type SurfaceId =
    | 'travel'
    | 'tasks'
    | 'activity'
    | 'calendar'
    | 'schedule'
    | 'expenses'
    | 'notifications'

const initialColors: Record<SurfaceId, string> = {
    travel: 'var(--background-app-ticket)',
    tasks: 'var(--background-vote-panel)',
    activity: 'var(--background-app-panel)',
    calendar: 'var(--background-calendar-panel)',
    schedule: 'var(--background-app-panel)',
    expenses: 'var(--background-app-panel)',
    notifications: 'var(--background-app-panel)',
}

const DASHBOARD_SCHEDULE_ITEM_LIMIT = 6

function getTripVotePath(tripId: number | string) {
    return `/app/room/${tripId}?workspace=votes`
}

function SectionTitle({
    title,
    action,
}: {
    title: string
    action?: React.ReactNode
}) {
    return (
        <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">
                {title}
            </h2>
            {action}
        </div>
    )
}

export function Home() {
    const navigate = useNavigate()
    const currentUser = useCurrentUserStore((state) => state.currentUser)
    const { trips, rooms, activeTripId, selectTrip, loadTrips } = useTripStore()
    const { logs } = useActivityLogStore()
    const [view] = useState<'dashboard' | 'list'>('dashboard')
    const [todayDateKey, setTodayDateKey] = useState(() =>
        toDateKey(new Date()),
    )
    const [createTripOpen, setCreateTripOpen] = useState(false)
    const [expenseComposerOpen, setExpenseComposerOpen] = useState(false)
    const [bookmarkPage, setBookmarkPage] = useState(0)
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
    const [focusedRecommendationPlaceId, setFocusedRecommendationPlaceId] =
        useState<string | null>(null)
    const [insightSlide, setInsightSlide] = useState(0)
    const [isTripSelectorOpen, setIsTripSelectorOpen] = useState(false)
    const tripSelectorRef = useRef<HTMLDivElement>(null)
    const activeTripData =
        trips.find((trip) => String(trip.id) === activeTripId) ?? trips[0]
    const [calendarCursor, setCalendarCursor] = useState<{
        tripId: number | null
        month: Date
    }>(() => ({ tripId: null, month: startOfMonth(new Date()) }))
    const defaultDashboardDate = getDefaultDashboardDate(
        activeTripData?.startDate,
        activeTripData?.endDate,
        todayDateKey,
    )
    const defaultCalendarMonth = defaultDashboardDate
        ? startOfMonth(parseLocalDate(defaultDashboardDate))
        : startOfMonth(new Date())
    const calendarMonth =
        calendarCursor.tripId === (activeTripData?.id ?? null)
            ? calendarCursor.month
            : defaultCalendarMonth
    const activeTrip = rooms.find((room) => room.id === activeTripId) ??
        rooms[0] ?? {
            id: '',
            title: '아직 여행방이 없습니다',
            date: '날짜 미정',
            location: '장소 미정',
            dday: '일정 미정',
            members: 0,
            cover: '/ec246eb2-6c56-4a2e-aa65-d09ffc9a62c9.jpg',
            status: '준비 전',
            color: 'var(--color-brand)',
        }
    const {
        tasks,
        pendingVoteCount,
        openPlaceVotes,
        expenses,
        setExpenses,
        settlement,
        setSettlement,
        dashboardError,
        itineraryDays,
        setItineraryDays,
        bookmarkedCards,
    } = useDashboardData({
        activeTrip: activeTripData,
        activeTripApiId: activeTrip.apiTripId,
    })
    const tripCountdownLabel = getTripCountdownLabel(
        activeTripData?.startDate,
        activeTripData?.endDate,
        activeTripData?.status,
        todayDateKey,
    )

    useEffect(() => {
        Promise.resolve().then(() => {
            setSelectedDate(
                getDefaultDashboardDate(
                    activeTripData?.startDate,
                    activeTripData?.endDate,
                    todayDateKey,
                ),
            )
            setFocusedItemId(null)
        })
    }, [
        activeTripData?.endDate,
        activeTripData?.id,
        activeTripData?.startDate,
        todayDateKey,
    ])

    const selectedItineraryDay =
        itineraryDays.find((day) => day.itineraryDate === selectedDate) ?? null
    const isCompletedTrip = activeTripData?.status === 'COMPLETED'
    const insightSlideOffset = isCompletedTrip ? 1 : 0
    const insightSlideCount = isCompletedTrip ? 2 : 3
    const visibleInsightSlide =
        (insightSlide % insightSlideCount) + insightSlideOffset
    const settlementSlideIndex = 2
    const bookmarkPageSize = 4
    const bookmarkPageCount = Math.max(
        1,
        Math.ceil(bookmarkedCards.length / bookmarkPageSize),
    )
    const visibleBookmarkPage = Math.min(bookmarkPage, bookmarkPageCount - 1)
    const visibleBookmarkedCards = bookmarkedCards.slice(
        visibleBookmarkPage * bookmarkPageSize,
        (visibleBookmarkPage + 1) * bookmarkPageSize,
    )

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setTodayDateKey(toDateKey(new Date()))
        }, 60_000)
        return () => window.clearInterval(intervalId)
    }, [])

    useEffect(() => {
        if (!isTripSelectorOpen) return

        function closeTripSelector(event: MouseEvent) {
            if (
                event.target instanceof Node &&
                !tripSelectorRef.current?.contains(event.target)
            ) {
                setIsTripSelectorOpen(false)
            }
        }

        function closeTripSelectorOnEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') setIsTripSelectorOpen(false)
        }

        document.addEventListener('mousedown', closeTripSelector)
        document.addEventListener('keydown', closeTripSelectorOnEscape)
        return () => {
            document.removeEventListener('mousedown', closeTripSelector)
            document.removeEventListener('keydown', closeTripSelectorOnEscape)
        }
    }, [isTripSelectorOpen])

    function editable(
        id: SurfaceId,
        label: string,
        children: React.ReactNode,
        className = '',
    ) {
        const color = initialColors[id]
        return (
            <div
                className={className}
                style={{ background: color }}
                aria-label={label}
            >
                {children}
            </div>
        )
    }

    return (
        <div className="min-h-full bg-[var(--color-app-background-alt)] px-8 py-7">
            <header className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_320px] items-center gap-4 px-1">
                <div className="min-w-0">
                    <h1 className="text-[30px] font-extrabold tracking-[-0.05em] text-slate-950">
                        안녕하세요, {currentUser?.nickname ?? '여행자'}님
                    </h1>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
                        <span className="text-xs font-semibold text-slate-500">
                            오늘 여행지는
                        </span>
                        <div
                            ref={tripSelectorRef}
                            className="relative w-fit max-w-full"
                        >
                            <button
                                type="button"
                                aria-haspopup="listbox"
                                aria-expanded={isTripSelectorOpen}
                                aria-label="여행방 선택"
                                disabled={rooms.length === 0}
                                onClick={() =>
                                    setIsTripSelectorOpen((open) => !open)
                                }
                                className="group flex min-h-10 w-fit max-w-full items-center gap-2 rounded-xl bg-[var(--background-trip-selector)] px-3 py-1.5 text-left transition hover:brightness-95 hover:shadow-[0_10px_24px_rgb(var(--rgb-app-navy)/0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <span className="min-w-0 break-keep text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-trip-selector)] transition-colors">
                                    {rooms.length > 0
                                        ? activeTrip.location
                                        : '아직 미정'}
                                </span>
                                <ChevronDownIcon
                                    size={17}
                                    className={`shrink-0 text-[var(--color-trip-selector)] transition-transform ${
                                        isTripSelectorOpen ? 'rotate-180' : ''
                                    }`}
                                />
                            </button>
                            {isTripSelectorOpen && rooms.length > 0 && (
                                <div
                                    role="listbox"
                                    aria-label="여행방 목록"
                                    className="mp-scroll absolute left-0 top-[calc(100%+8px)] z-50 max-h-64 min-w-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgb(var(--rgb-app-ink)/0.16)]"
                                >
                                    {rooms.map((room) => {
                                        const isSelected =
                                            room.id === activeTrip.id
                                        return (
                                            <button
                                                key={room.id}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => {
                                                    selectTrip(room.id)
                                                    setIsTripSelectorOpen(false)
                                                }}
                                                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-extrabold transition ${
                                                    isSelected
                                                        ? 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)]'
                                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                                }`}
                                            >
                                                <span className="min-w-0 flex-1 truncate">
                                                    {room.title}
                                                </span>
                                                {isSelected && (
                                                    <CheckCircle2Icon
                                                        size={16}
                                                        className="shrink-0"
                                                    />
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <span className="text-xs font-semibold text-slate-500">
                            입니다
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-5">
                    <button
                        onClick={() => setCreateTripOpen(true)}
                        className="flamingo-glow flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-sm font-black text-[var(--color-on-brand)] transition hover:opacity-90"
                    >
                        <PlusIcon size={16} strokeWidth={2.5} /> 새 여행방
                    </button>
                </div>
            </header>

            {dashboardError && (
                <p
                    role="alert"
                    className="mx-auto mt-4 max-w-[1440px] rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600"
                >
                    {dashboardError}
                </p>
            )}

            {view === 'list' ? (
                <div className="mx-auto mt-6 max-w-[1440px] space-y-5 px-1">
                    <section className="rounded-[24px] border border-slate-100 bg-white/60 p-5 shadow-[0_10px_30px_rgb(var(--rgb-app-ink)/0.04)]">
                        <TravelRooms embedded compact />
                    </section>
                    <section className="rounded-[24px] border border-slate-100 bg-white/60 p-5 shadow-[0_10px_30px_rgb(var(--rgb-app-ink)/0.04)]">
                        <SectionTitle
                            title="북마크한 여행 카드"
                            action={
                                bookmarkedCards.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => navigate('/app/explore')}
                                        className="flex items-center gap-1 text-xs font-extrabold text-brand-700 hover:text-brand-800"
                                    >
                                        모두 보기
                                        <ChevronRightIcon size={14} />
                                    </button>
                                ) : undefined
                            }
                        />
                        {bookmarkedCards.length === 0 ? (
                            <div className="flex min-h-40 flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white px-5 py-8 text-center">
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                                    <BookmarkIcon size={18} />
                                </span>
                                <p className="mt-3 text-sm font-extrabold text-slate-700">
                                    저장한 여행 카드가 없습니다
                                </p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/app/explore')}
                                    className="mt-2 text-xs font-bold text-brand-700 hover:underline"
                                >
                                    둘러보기에서 여행 찾기
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-4 gap-4">
                                    {visibleBookmarkedCards.map((card) => (
                                        <article
                                            key={card.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() =>
                                                navigate(
                                                    `/app/explore/${card.id}`,
                                                )
                                            }
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === 'Enter' ||
                                                    event.key === ' '
                                                ) {
                                                    navigate(
                                                        `/app/explore/${card.id}`,
                                                    )
                                                }
                                            }}
                                            className="group min-w-0 cursor-pointer overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-md"
                                        >
                                            <img
                                                src={
                                                    resolveMediaUrl(
                                                        card.coverImageUrl,
                                                    ) ??
                                                    '/ec246eb2-6c56-4a2e-aa65-d09ffc9a62c9.jpg'
                                                }
                                                alt={`${card.title} 여행 카드`}
                                                className="aspect-[16/8] w-full object-cover transition duration-500 group-hover:scale-105"
                                            />
                                            <div className="flex min-w-0 flex-col p-3.5">
                                                <div className="flex min-w-0 items-start justify-between gap-2">
                                                    <h3 className="truncate text-sm font-extrabold text-slate-900">
                                                        {card.title}
                                                    </h3>
                                                    <BookmarkIcon
                                                        size={15}
                                                        fill="currentColor"
                                                        className="shrink-0 text-brand-700"
                                                    />
                                                </div>
                                                <p className="mt-1 truncate text-[11px] font-semibold text-slate-400">
                                                    {card.destination ??
                                                        '여행지 미정'}{' '}
                                                    · {card.authorNickname}
                                                </p>
                                                {(card.travelStyles.length >
                                                    0 ||
                                                    card.tags.length > 0) && (
                                                    <div className="mt-2 flex min-w-0 gap-1 overflow-hidden">
                                                        {[
                                                            ...card.travelStyles.map(
                                                                (style) => ({
                                                                    label:
                                                                        PUBLIC_CARD_STYLE_LABELS[
                                                                            style
                                                                        ] ??
                                                                        style,
                                                                    style: true,
                                                                }),
                                                            ),
                                                            ...card.tags.map(
                                                                (tag) => ({
                                                                    label: tag,
                                                                    style: false,
                                                                }),
                                                            ),
                                                        ]
                                                            .slice(0, 2)
                                                            .map((tag) => (
                                                                <span
                                                                    key={`${tag.style}-${tag.label}`}
                                                                    className={`max-w-24 truncate rounded-full px-2 py-1 text-[10px] font-bold ${tag.style ? 'bg-[var(--color-app-navy)]/10 text-[var(--color-app-navy)]' : 'bg-brand-50 text-brand-700'}`}
                                                                >
                                                                    #{tag.label}
                                                                </span>
                                                            ))}
                                                    </div>
                                                )}
                                                <div className="mt-auto flex items-center gap-3 pt-2 text-[10px] font-bold text-slate-400">
                                                    <span className="flex items-center gap-1">
                                                        <BookmarkIcon
                                                            size={11}
                                                        />
                                                        {card.bookmarkCount}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <MessageCircleIcon
                                                            size={11}
                                                        />
                                                        {card.commentCount}
                                                    </span>
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                                {bookmarkPageCount > 1 && (
                                    <nav
                                        aria-label="북마크 여행 카드 페이지"
                                        className="mt-4 flex items-center justify-center gap-3"
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setBookmarkPage(
                                                    visibleBookmarkPage - 1,
                                                )
                                            }
                                            disabled={visibleBookmarkPage === 0}
                                            aria-label="이전 북마크 카드"
                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-brand-200 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            <ChevronLeftIcon size={15} />
                                        </button>
                                        <span className="text-xs font-extrabold text-slate-500">
                                            {visibleBookmarkPage + 1} /{' '}
                                            {bookmarkPageCount}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setBookmarkPage(
                                                    visibleBookmarkPage + 1,
                                                )
                                            }
                                            disabled={
                                                visibleBookmarkPage + 1 >=
                                                bookmarkPageCount
                                            }
                                            aria-label="다음 북마크 카드"
                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-brand-200 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            <ChevronRightIcon size={15} />
                                        </button>
                                    </nav>
                                )}
                            </>
                        )}
                    </section>
                </div>
            ) : (
                <>
                    <main className="mx-auto mt-6 grid max-w-[1440px] grid-cols-[minmax(0,1fr)_320px] gap-4">
                        <div className="min-w-0 space-y-4">
                            <div className="grid h-[300px] grid-cols-[minmax(0,1fr)_290px] items-stretch gap-4">
                                {editable(
                                    'travel',
                                    '여행 현황',
                                    <motion.section
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.32 }}
                                        className="relative h-full overflow-hidden rounded-[22px] bg-[var(--background-app-ticket)] shadow-[0_12px_30px_rgb(var(--rgb-app-ink)/0.12)]"
                                    >
                                        <span className="absolute right-[80px] top-0 z-10 h-6 w-6 -translate-y-1/2 rounded-full bg-[var(--color-app-background-alt)]" />
                                        <span className="absolute right-[80px] bottom-0 z-10 h-6 w-6 translate-y-1/2 rounded-full bg-[var(--color-app-background-alt)]" />
                                        <div className="relative flex h-full flex-col pb-6 pr-[92px]">
                                            <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
                                                <div className="flex items-center gap-3">
                                                    <p className="font-display text-xs font-black uppercase tracking-[0.24em] text-[var(--color-app-navy-muted)]">
                                                        Boarding pass
                                                    </p>
                                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--background-trip-status)] px-2.5 py-1 text-[10px] font-black text-[var(--color-trip-status)]">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-trip-status)]" />
                                                        {getTripStatusLabel(
                                                            activeTripData?.startDate,
                                                            activeTripData?.endDate,
                                                            activeTripData?.status,
                                                            todayDateKey,
                                                            activeTrip.status,
                                                        )}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        navigate(
                                                            `/app/room/${activeTrip.id}`,
                                                        )
                                                    }
                                                    disabled={!activeTrip.id}
                                                    className="flex items-center gap-1 rounded-full bg-[var(--theme-dashboard-ticket-button)] px-3 py-2 text-xs font-extrabold text-[var(--theme-dashboard-ticket-button-text)] transition-colors hover:bg-[var(--theme-dashboard-ticket-button-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    여행방 열기
                                                    <ChevronRightIcon
                                                        size={14}
                                                    />
                                                </button>
                                            </div>

                                            <div className="mt-5 px-6">
                                                <div className="grid grid-cols-[auto_minmax(90px,1fr)_auto] gap-3">
                                                    <p className="font-display text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-app-navy-muted)]">
                                                        From
                                                    </p>
                                                    <span />
                                                    <p className="text-right font-display text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-app-navy-muted)]">
                                                        To
                                                    </p>
                                                </div>
                                                <div className="mt-1 grid grid-cols-[auto_minmax(90px,1fr)_auto] items-center gap-3">
                                                    <strong className="block whitespace-nowrap font-display text-[clamp(2.25rem,2.4vw,3rem)] font-black tracking-[-0.04em] text-[var(--color-app-neutral)]">
                                                        {getOriginCode(
                                                            activeTrip,
                                                        )}
                                                    </strong>
                                                    <div
                                                        className="relative flex items-center"
                                                        aria-hidden="true"
                                                    >
                                                        <span className="mx-auto w-full max-w-[60%] border-t-2 border-dashed border-[var(--color-app-navy-soft)]/55" />
                                                        <span className="absolute left-1/2 flex h-8 w-10 -translate-x-1/2 items-center justify-center bg-[var(--color-app-navy-700)]">
                                                            <PlaneIcon
                                                                size={30}
                                                                className="rotate-45 text-[var(--color-app-ticket-accent)]"
                                                            />
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        {isDestinationSet(
                                                            activeTrip.location,
                                                        ) ? (
                                                            <strong className="block whitespace-nowrap font-display text-[clamp(2.25rem,2.4vw,3rem)] font-black tracking-[-0.04em] text-[var(--color-app-neutral)]">
                                                                {getTicketDestinationCode(
                                                                    activeTrip,
                                                                )}
                                                            </strong>
                                                        ) : (
                                                            <strong className="inline-flex rounded-xl border-2 border-dashed border-[var(--color-app-navy-soft)]/70 px-3 py-1 font-display text-4xl font-black tracking-[0.08em] text-[var(--color-app-navy-muted)]">
                                                                ???
                                                            </strong>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mx-6 mt-auto grid grid-cols-[0.9fr_1.25fr] items-end gap-4 border-t border-dashed border-[var(--color-app-navy-soft)]/55 pt-4">
                                                <div>
                                                    <p className="font-display text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-app-navy-muted)]">
                                                        Traveler
                                                    </p>
                                                    <div className="mt-2 flex items-center">
                                                        <Avatar
                                                            name={
                                                                currentUser?.nickname ??
                                                                '여행자'
                                                            }
                                                            color="var(--color-brand)"
                                                            imageUrl={resolveMediaUrl(
                                                                currentUser?.profileImageUrl,
                                                            )}
                                                            size={30}
                                                        />
                                                        <span className="ml-2 truncate text-xs font-extrabold text-[var(--color-app-neutral)]">
                                                            {currentUser?.nickname ??
                                                                '여행자'}{' '}
                                                            외{' '}
                                                            {Math.max(
                                                                activeTrip.members -
                                                                    1,
                                                                0,
                                                            )}
                                                            명
                                                        </span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <p className="font-display text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-app-navy-muted)]">
                                                        Travel date
                                                    </p>
                                                    <div className="mt-2">
                                                        <span className="text-sm font-black text-[var(--color-app-neutral)]">
                                                            {formatTripDateRange(
                                                                activeTripData?.startDate,
                                                                activeTripData?.endDate,
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="absolute bottom-0 right-0 top-0 flex w-[92px] flex-col items-center justify-between border-l-2 border-dashed border-[var(--color-app-navy-soft)]/65 bg-[var(--background-app-ticket-stub)] py-7">
                                                <span className="font-display text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-app-navy-muted)] [writing-mode:vertical-rl]">
                                                    Departure
                                                </span>
                                                <strong className="font-display text-3xl font-black text-[var(--color-app-ticket-accent)] [writing-mode:vertical-rl]">
                                                    {tripCountdownLabel}
                                                </strong>
                                                <span aria-hidden="true" />
                                            </div>
                                        </div>
                                    </motion.section>,
                                    'h-full overflow-hidden rounded-[22px]',
                                )}

                                {editable(
                                    'tasks',
                                    '투표 대기',
                                    <section
                                        className={`flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border p-5 shadow-[0_12px_30px_rgb(var(--rgb-app-ink)/0.07)] transition-colors duration-500 ${
                                            visibleInsightSlide === 0
                                                ? 'border-[var(--color-app-border)] bg-[var(--background-vote-panel)]'
                                                : 'border-slate-200 bg-white'
                                        }`}
                                    >
                                        <div className="min-h-0 flex-1 overflow-hidden">
                                            <div
                                                className="flex h-full transition-transform duration-500 ease-out"
                                                style={{
                                                    transform: `translateX(-${visibleInsightSlide * 100}%)`,
                                                }}
                                            >
                                                <div
                                                    aria-hidden={
                                                        visibleInsightSlide !==
                                                        0
                                                    }
                                                    className={`flex w-full shrink-0 flex-col overflow-hidden transition-opacity duration-300 ${
                                                        visibleInsightSlide ===
                                                        0
                                                            ? 'opacity-100'
                                                            : 'pointer-events-none opacity-0'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span className="relative h-11 w-11 shrink-0">
                                                            <span className="absolute bottom-0 left-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-vote-accent)] text-[var(--color-vote-accent-text)]">
                                                                <ThumbsUpIcon
                                                                    size={18}
                                                                />
                                                            </span>
                                                            {pendingVoteCount >
                                                                0 && (
                                                                <span className="absolute right-0 top-0 z-20 block h-3.5 w-3.5 rounded-full border-2 border-[var(--color-brand-surface)] bg-orange-400 shadow-sm" />
                                                            )}
                                                        </span>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-base font-black text-[var(--color-brand-deep)]">
                                                                투표 대기{' '}
                                                                {
                                                                    pendingVoteCount
                                                                }
                                                                건
                                                            </p>
                                                            <p className="mt-0.5 text-[11px] font-semibold text-[var(--color-brand-muted)]">
                                                                내 투표를
                                                                기다리고 있어요
                                                            </p>
                                                        </div>
                                                        {pendingVoteCount >
                                                            0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    navigate(
                                                                        getTripVotePath(
                                                                            activeTrip.id,
                                                                        ),
                                                                    )
                                                                }
                                                                className="ml-auto inline-flex shrink-0 items-center gap-1 pt-1 text-xs font-black text-[var(--color-brand-dark)]"
                                                            >
                                                                투표하기
                                                                <ChevronRightIcon
                                                                    size={16}
                                                                />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {openPlaceVotes.length >
                                                    0 ? (
                                                        <div className="mp-scroll mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                                                            {openPlaceVotes.map(
                                                                (vote) => {
                                                                    const hasVoted =
                                                                        vote.myChoice !==
                                                                        null
                                                                    const requiredCount =
                                                                        Math.max(
                                                                            vote.requiredResponseCount,
                                                                            1,
                                                                        )
                                                                    const voteProgress =
                                                                        Math.min(
                                                                            100,
                                                                            (vote.responseCount /
                                                                                requiredCount) *
                                                                                100,
                                                                        )

                                                                    return (
                                                                        <button
                                                                            key={
                                                                                vote.voteRequestId
                                                                            }
                                                                            type="button"
                                                                            onClick={() =>
                                                                                navigate(
                                                                                    getTripVotePath(
                                                                                        activeTrip.id,
                                                                                    ),
                                                                                )
                                                                            }
                                                                            className={`flex w-full items-center gap-4 rounded-[18px] px-4 py-3 text-left transition ${
                                                                                hasVoted
                                                                                    ? 'bg-white/65 hover:bg-white/80'
                                                                                    : 'bg-white/90 hover:bg-white'
                                                                            }`}
                                                                        >
                                                                            <span className="min-w-0 flex-1">
                                                                                <span className="block truncate text-sm font-black text-slate-800">
                                                                                    {
                                                                                        vote.placeName
                                                                                    }
                                                                                </span>
                                                                                <span className="mt-1 block truncate text-xs font-semibold text-slate-400">
                                                                                    {
                                                                                        vote.categoryName
                                                                                    }
                                                                                </span>
                                                                            </span>
                                                                            <span className="w-20 shrink-0">
                                                                                {hasVoted ? (
                                                                                    <span className="flex items-center justify-end gap-1 text-xs font-black text-emerald-600">
                                                                                        <CheckCircle2Icon
                                                                                            size={
                                                                                                15
                                                                                            }
                                                                                        />
                                                                                        투표
                                                                                        완료
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="block text-right text-sm font-black text-[var(--color-brand-dark)]">
                                                                                        {
                                                                                            vote.responseCount
                                                                                        }

                                                                                        /
                                                                                        {
                                                                                            vote.requiredResponseCount
                                                                                        }
                                                                                    </span>
                                                                                )}
                                                                                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[var(--color-brand-surface-strong)]">
                                                                                    <span
                                                                                        className="block h-full rounded-full bg-[var(--color-brand)]"
                                                                                        style={{
                                                                                            width: `${voteProgress}%`,
                                                                                        }}
                                                                                    />
                                                                                </span>
                                                                            </span>
                                                                        </button>
                                                                    )
                                                                },
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="mt-4 flex flex-1 items-center justify-center rounded-[18px] bg-white/85 px-4 text-center">
                                                            <div>
                                                                <p className="text-xs font-extrabold leading-5 text-slate-700">
                                                                    현재 참여할
                                                                    투표가
                                                                    없습니다.
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        navigate(
                                                                            getTripVotePath(
                                                                                activeTrip.id,
                                                                            ),
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        !activeTrip.id
                                                                    }
                                                                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-extrabold text-[var(--color-brand-dark)] disabled:opacity-40"
                                                                >
                                                                    투표하러
                                                                    가기
                                                                    <ChevronRightIcon
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    aria-hidden={
                                                        visibleInsightSlide !==
                                                        1
                                                    }
                                                    className={`flex w-full shrink-0 flex-col overflow-hidden transition-opacity duration-300 ${
                                                        visibleInsightSlide ===
                                                        1
                                                            ? 'opacity-100'
                                                            : 'pointer-events-none opacity-0'
                                                    }`}
                                                >
                                                    <h2 className="shrink-0 text-base font-black text-slate-900">
                                                        최근 활동
                                                    </h2>
                                                    {logs.length > 0 ? (
                                                        <div className="mp-scroll mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
                                                            <div className="relative ml-2 border-l border-slate-200 pl-5">
                                                                {logs.map(
                                                                    (log) => (
                                                                        <article
                                                                            key={
                                                                                log.id
                                                                            }
                                                                            className="relative pb-5 last:pb-1"
                                                                        >
                                                                            <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--color-brand)] ring-2 ring-white" />
                                                                            <time className="block text-xs font-semibold text-slate-400">
                                                                                {new Intl.DateTimeFormat(
                                                                                    'ko-KR',
                                                                                    {
                                                                                        month: 'long',
                                                                                        day: 'numeric',
                                                                                        hour: '2-digit',
                                                                                        minute: '2-digit',
                                                                                    },
                                                                                ).format(
                                                                                    new Date(
                                                                                        log.createdAt,
                                                                                    ),
                                                                                )}
                                                                            </time>
                                                                            <p className="mt-1.5 text-[13px] font-medium leading-5 text-slate-600">
                                                                                {
                                                                                    log.description
                                                                                }
                                                                            </p>
                                                                        </article>
                                                                    ),
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-5 flex min-h-0 flex-1 items-center justify-center rounded-[18px] bg-slate-50 px-4 text-center text-xs font-semibold text-slate-400">
                                                            아직 기록된 활동이
                                                            없습니다.
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    aria-hidden={
                                                        visibleInsightSlide !==
                                                        settlementSlideIndex
                                                    }
                                                    className={`flex w-full shrink-0 flex-col overflow-hidden transition-opacity duration-300 ${
                                                        visibleInsightSlide ===
                                                        settlementSlideIndex
                                                            ? 'opacity-100'
                                                            : 'pointer-events-none opacity-0'
                                                    }`}
                                                >
                                                    <div className="relative flex min-h-0 flex-1 flex-col">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                navigate(
                                                                    `/app/room/${activeTrip.id}/record`,
                                                                )
                                                            }
                                                            disabled={
                                                                !activeTrip.id
                                                            }
                                                            className="absolute right-0 top-0 inline-flex items-center gap-0.5 text-[10px] font-black text-[var(--color-app-navy)] transition-colors hover:text-[var(--color-brand)] disabled:opacity-40"
                                                        >
                                                            정산 내역
                                                            <ChevronRightIcon
                                                                size={12}
                                                            />
                                                        </button>
                                                        <div className="text-center">
                                                            <p className="font-display text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">
                                                                Receipt
                                                            </p>
                                                            <p className="mt-0.5 truncate text-xs font-black text-slate-800">
                                                                {
                                                                    activeTrip.title
                                                                }
                                                            </p>
                                                        </div>
                                                        <div className="my-2 border-t border-dashed border-slate-300" />
                                                        <div className="flex-1 space-y-2">
                                                            {expenses.length ===
                                                            0 ? (
                                                                <p className="py-3 text-center text-[11px] font-semibold text-slate-400">
                                                                    등록된
                                                                    지출이 아직
                                                                    없어요.
                                                                </p>
                                                            ) : (
                                                                expenses
                                                                    .slice(-3)
                                                                    .reverse()
                                                                    .map(
                                                                        (
                                                                            expense,
                                                                        ) => (
                                                                            <div
                                                                                key={
                                                                                    expense.id
                                                                                }
                                                                                className="flex items-center justify-between gap-3 text-[11px]"
                                                                            >
                                                                                <span className="min-w-0 truncate font-bold text-slate-600">
                                                                                    {
                                                                                        expense.title
                                                                                    }
                                                                                </span>
                                                                                <strong className="shrink-0 font-black text-slate-800">
                                                                                    {currency(
                                                                                        expense.totalAmount,
                                                                                    )}
                                                                                </strong>
                                                                            </div>
                                                                        ),
                                                                    )
                                                            )}
                                                        </div>
                                                        {expenses.length >=
                                                            3 && (
                                                            <div
                                                                className="flex h-4 shrink-0 items-center justify-center text-slate-400"
                                                                aria-label="추가 정산 내역이 있습니다"
                                                            >
                                                                <EllipsisVerticalIcon
                                                                    size={15}
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="mt-2 flex items-end justify-between border-t border-dashed border-slate-300 pt-2">
                                                            <span className="font-display text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                                Total
                                                            </span>
                                                            <strong className="text-lg font-black text-slate-900">
                                                                {currency(
                                                                    settlement?.totalExpense ??
                                                                        0,
                                                                )}
                                                            </strong>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setExpenseComposerOpen(
                                                                    true,
                                                                )
                                                            }
                                                            disabled={
                                                                !activeTrip.apiTripId
                                                            }
                                                            className="mt-2 inline-flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded-xl bg-[var(--color-app-navy)] text-[11px] font-black text-white transition-colors hover:bg-[var(--color-app-navy-900)] disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <PlusIcon
                                                                size={13}
                                                            />
                                                            지출 추가
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {insightSlideCount > 1 && (
                                            <div
                                                className="mt-3 flex justify-center gap-2"
                                                role="tablist"
                                                aria-label="투표, 활동 및 정산 슬라이드"
                                            >
                                                {Array.from({
                                                    length: insightSlideCount,
                                                }).map((_, index) => (
                                                    <button
                                                        key={index}
                                                        type="button"
                                                        role="tab"
                                                        aria-selected={
                                                            visibleInsightSlide ===
                                                            index +
                                                                insightSlideOffset
                                                        }
                                                        aria-label={`${index + 1}번 슬라이드 보기`}
                                                        onClick={() =>
                                                            setInsightSlide(
                                                                index,
                                                            )
                                                        }
                                                        className={`h-2 rounded-full transition-all ${
                                                            visibleInsightSlide ===
                                                            index +
                                                                insightSlideOffset
                                                                ? 'w-5 bg-[var(--color-carousel-active)]'
                                                                : 'w-2 bg-[var(--color-carousel-inactive)] hover:brightness-95'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </section>,
                                    'h-full min-h-0 overflow-hidden rounded-[22px]',
                                )}
                            </div>

                            <section className="flex h-[560px] flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_14px_35px_rgb(var(--rgb-app-ink)/0.06)]">
                                <div className="flex shrink-0 items-center justify-between px-6 py-5">
                                    <div>
                                        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--color-brand-dark)]">
                                            Selected day
                                        </p>
                                        <h2 className="mt-1 text-lg font-black text-slate-900">
                                            {selectedItineraryDay
                                                ? `Day ${selectedItineraryDay.dayNumber} · ${selectedItineraryDay.title ?? '여행 일정'}`
                                                : '전체 일정'}
                                        </h2>
                                    </div>
                                    {activeTrip.apiTripId ? (
                                        <AiDashboardActions
                                            tripId={activeTrip.apiTripId}
                                            days={itineraryDays}
                                            startDate={
                                                activeTrip.startDate ?? null
                                            }
                                            endDate={activeTrip.endDate ?? null}
                                            selectedDayId={
                                                selectedItineraryDay
                                                    ? Number(
                                                          selectedItineraryDay.id,
                                                      )
                                                    : null
                                            }
                                            renderRecommendationMap={(
                                                recommendation,
                                                context,
                                            ) => {
                                                const recommendationPlace: Place =
                                                    {
                                                        id: `ai-recommendation-${recommendation.place.googlePlaceId}`,
                                                        googlePlaceId:
                                                            recommendation.place
                                                                .googlePlaceId,
                                                        roomId: activeTrip.id,
                                                        name: recommendation
                                                            .place.name,
                                                        address:
                                                            recommendation.place
                                                                .address ?? '',
                                                        category: 'other',
                                                        categoryId: null,
                                                        categoryName: 'AI 추천',
                                                        categoryColor:
                                                            'var(--color-brand)',
                                                        categoryIcon: 'HEART',
                                                        status: 'hold',
                                                        image: '',
                                                        lat: recommendation
                                                            .place.latitude,
                                                        lng: recommendation
                                                            .place.longitude,
                                                        addedBy: 'PLAMINGO AI',
                                                        comments: [],
                                                        commentCount: 0,
                                                    }
                                                const routeDay =
                                                    itineraryDays.find(
                                                        (day) =>
                                                            Number(day.id) ===
                                                            context.dayId,
                                                    )
                                                return (
                                                    <div className="h-full [&>div]:h-full [&>div]:border-0 [&>div>button]:hidden [&>div>div]:h-full">
                                                        <KanbanMapPanel
                                                            days={
                                                                routeDay
                                                                    ? [routeDay]
                                                                    : []
                                                            }
                                                            places={[
                                                                recommendationPlace,
                                                            ]}
                                                            activeDragId={null}
                                                            previewDayId={null}
                                                            hoveredItemId={null}
                                                            onItemHoverChange={() =>
                                                                undefined
                                                            }
                                                            focusedItemId={null}
                                                            focusedPlaceId={
                                                                focusedRecommendationPlaceId
                                                            }
                                                            highlightedPlaceId={
                                                                recommendationPlace.id
                                                            }
                                                            onItemFocus={() =>
                                                                undefined
                                                            }
                                                            onPlaceFocus={(
                                                                id,
                                                            ) =>
                                                                setFocusedRecommendationPlaceId(
                                                                    (
                                                                        current,
                                                                    ) =>
                                                                        current ===
                                                                        id
                                                                            ? null
                                                                            : id,
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                )
                                            }}
                                            onReplanApplied={setItineraryDays}
                                        />
                                    ) : (
                                        <MapIcon
                                            className="text-slate-300"
                                            size={22}
                                        />
                                    )}
                                </div>
                                {itineraryDays.length > 0 && (
                                    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-6 pb-3 pt-1 scrollbar-none">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedDate(null)
                                                setFocusedItemId(null)
                                            }}
                                            aria-pressed={selectedDate == null}
                                            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                                                selectedDate == null
                                                    ? 'border-transparent bg-[var(--color-app-text)] text-white'
                                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                            }`}
                                        >
                                            전체
                                        </button>
                                        {itineraryDays.map((day) => {
                                            const isActive =
                                                day.itineraryDate ===
                                                selectedDate
                                            return (
                                                <button
                                                    key={day.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedDate(
                                                            day.itineraryDate,
                                                        )
                                                        setFocusedItemId(null)
                                                    }}
                                                    aria-pressed={isActive}
                                                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                                                        isActive
                                                            ? 'border-transparent bg-[var(--color-brand)] text-white'
                                                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                                    }`}
                                                >
                                                    Day {day.dayNumber}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                                {itineraryDays.length > 0 ? (
                                    <div className="min-h-0 flex-1 [&>div]:h-full [&>div]:border-0 [&>div>button]:hidden [&>div>div]:h-full">
                                        <KanbanMapPanel
                                            days={itineraryDays}
                                            places={[]}
                                            activeDragId={null}
                                            previewDayId={null}
                                            hoveredItemId={hoveredItemId}
                                            onItemHoverChange={setHoveredItemId}
                                            focusedItemId={focusedItemId}
                                            focusedPlaceId={null}
                                            emphasizedDayNumber={
                                                selectedItineraryDay?.dayNumber ??
                                                null
                                            }
                                            onItemFocus={setFocusedItemId}
                                            onPlaceFocus={() => undefined}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50">
                                        <p className="text-sm font-semibold text-slate-400">
                                            아직 등록된 일정이 없어요.
                                        </p>
                                    </div>
                                )}
                            </section>

                            <div className="hidden">
                                {editable(
                                    'tasks',
                                    '오늘 할 일',
                                    <section className="rounded-2xl border border-slate-200 p-5 shadow-sm">
                                        <SectionTitle
                                            title="오늘 해야 하는 일"
                                            action={
                                                <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-700">
                                                    {tasks.length}개 남음
                                                </span>
                                            }
                                        />
                                        <div className="divide-y divide-slate-100">
                                            {tasks.length === 0 ? (
                                                <div className="py-10 text-center">
                                                    <CheckCircle2Icon
                                                        className="mx-auto text-brand"
                                                        size={28}
                                                    />
                                                    <p className="mt-2 text-sm font-semibold text-slate-700">
                                                        연결된 할 일 데이터가
                                                        없습니다.
                                                    </p>
                                                </div>
                                            ) : (
                                                tasks.map((task) => (
                                                    <div
                                                        key={task.id}
                                                        className="flex w-full items-center gap-3 py-3 text-left"
                                                    >
                                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-brand bg-brand text-white">
                                                            <CheckCircle2Icon
                                                                size={14}
                                                            />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-sm font-semibold text-slate-700">
                                                                {task.label}
                                                            </span>
                                                            <span className="mt-0.5 block truncate text-xs text-slate-400">
                                                                {task.meta}
                                                            </span>
                                                        </span>
                                                        {task.urgent && (
                                                            <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </section>,
                                )}
                                {editable(
                                    'activity',
                                    '최근 활동',
                                    <section className="rounded-[22px] border border-slate-100 p-5 shadow-sm">
                                        <SectionTitle
                                            title="최근 활동"
                                            action={
                                                <button
                                                    type="button"
                                                    disabled={!activeTrip.id}
                                                    onClick={() =>
                                                        navigate(
                                                            `/app/room/${activeTrip.id}?activity=open`,
                                                        )
                                                    }
                                                    className="text-xs font-bold text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    모두 보기
                                                </button>
                                            }
                                        />
                                        <div className="relative ml-2 border-l border-slate-200 pl-5">
                                            {logs.length === 0 ? (
                                                <p className="py-6 text-sm text-slate-400">
                                                    아직 기록된 활동이 없습니다.
                                                </p>
                                            ) : (
                                                logs.slice(0, 3).map((log) => (
                                                    <div
                                                        className="relative pb-4 last:pb-0"
                                                        key={log.id}
                                                    >
                                                        <span className="absolute -left-[25px] top-1 flex h-3 w-3 rounded-full border-2 border-white bg-brand" />
                                                        <p className="text-xs text-slate-400">
                                                            {new Intl.DateTimeFormat(
                                                                'ko-KR',
                                                                {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                },
                                                            ).format(
                                                                new Date(
                                                                    log.createdAt,
                                                                ),
                                                            )}
                                                        </p>
                                                        <p className="mt-0.5 text-sm leading-5 text-slate-600">
                                                            {log.description}
                                                        </p>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </section>,
                                )}
                            </div>

                            <section className="hidden">
                                <SectionTitle
                                    title="내 여행방"
                                    action={
                                        <button className="flex items-center gap-0.5 text-xs font-bold text-slate-400 hover:text-slate-700">
                                            전체 보기{' '}
                                            <ChevronRightIcon size={14} />
                                        </button>
                                    }
                                />
                                <div className="grid grid-cols-3 gap-4">
                                    {rooms.length === 0 && (
                                        <button
                                            onClick={() =>
                                                navigate('/app/room')
                                            }
                                            className="col-span-full rounded-2xl border border-dashed border-brand-200 bg-brand-50 px-5 py-12 text-center"
                                        >
                                            <PlusIcon
                                                className="mx-auto text-brand"
                                                size={24}
                                            />
                                            <b className="mt-3 block text-sm text-slate-800">
                                                첫 여행방을 만들어 보세요
                                            </b>
                                            <span className="mt-1 block text-xs text-slate-500">
                                                여행방 생성 화면으로 이동합니다.
                                            </span>
                                        </button>
                                    )}
                                    {rooms.map((room, index) => (
                                        <motion.button
                                            key={room.id}
                                            whileHover={{
                                                y: -3,
                                                rotate:
                                                    index === 1 ? 0.4 : -0.4,
                                            }}
                                            onClick={() => selectTrip(room.id)}
                                            aria-pressed={
                                                room.id === activeTrip.id
                                            }
                                            className={`group relative min-h-[205px] overflow-hidden rounded-sm border bg-white p-3 text-left shadow-[0_7px_14px_rgb(var(--rgb-app-ink)/0.08)] transition hover:shadow-md ${room.id === activeTrip.id ? 'border-brand ring-2 ring-brand/20' : 'border-slate-200'}`}
                                        >
                                            <div className="absolute left-1/2 top-0 h-5 w-16 -translate-x-1/2 rounded-b bg-[var(--color-app-ticket-notch)]/90" />
                                            <img
                                                src={room.cover}
                                                alt=""
                                                className="h-[116px] w-full rounded-sm object-cover"
                                            />
                                            <div className="px-1 pt-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <h3 className="truncate text-sm font-extrabold">
                                                        {room.title}
                                                    </h3>
                                                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                                        {room.status}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-[11px] text-slate-500">
                                                    {room.members}명 ·{' '}
                                                    {room.dday}
                                                </p>
                                                <p className="mt-2 truncate text-[10px] text-slate-400">
                                                    {room.location} ·{' '}
                                                    {room.date}
                                                </p>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </section>
                        </div>

                        <aside className="min-w-0 space-y-4">
                            {editable(
                                'calendar',
                                '캘린더',
                                <section className="h-full rounded-[22px] bg-[var(--background-calendar-panel)] p-5">
                                    <div className="px-1 pb-2">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-extrabold tracking-tight">
                                                {calendarMonth.getFullYear()}년{' '}
                                                {calendarMonth.getMonth() + 1}월
                                            </h2>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() =>
                                                        setCalendarCursor({
                                                            tripId:
                                                                activeTripData?.id ??
                                                                null,
                                                            month: addMonths(
                                                                calendarMonth,
                                                                -1,
                                                            ),
                                                        })
                                                    }
                                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-[var(--color-brand-700)] hover:bg-slate-50"
                                                    aria-label="이전 달"
                                                >
                                                    ‹
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setCalendarCursor({
                                                            tripId:
                                                                activeTripData?.id ??
                                                                null,
                                                            month: addMonths(
                                                                calendarMonth,
                                                                1,
                                                            ),
                                                        })
                                                    }
                                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-[var(--color-brand-700)] hover:bg-slate-50"
                                                    aria-label="다음 달"
                                                >
                                                    ›
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-4 grid grid-cols-7 gap-y-3 text-center text-[10px] font-bold text-slate-400">
                                            <span>일</span>
                                            <span>월</span>
                                            <span>화</span>
                                            <span>수</span>
                                            <span>목</span>
                                            <span>금</span>
                                            <span>토</span>
                                            {createCalendarDays(
                                                calendarMonth,
                                            ).map((day) => {
                                                const dateKey = toDateKey(day)
                                                const isAvailable = isTripDate(
                                                    day,
                                                    activeTripData?.startDate,
                                                    activeTripData?.endDate,
                                                )
                                                const isSelected =
                                                    selectedDate === dateKey
                                                return (
                                                    <button
                                                        type="button"
                                                        key={dateKey}
                                                        disabled={!isAvailable}
                                                        onClick={() => {
                                                            setSelectedDate(
                                                                dateKey,
                                                            )
                                                            setFocusedItemId(
                                                                null,
                                                            )
                                                        }}
                                                        aria-pressed={
                                                            isSelected
                                                        }
                                                        aria-label={`${dateKey}${isAvailable ? ' 여행 일정 선택' : ''}`}
                                                        className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full transition ${
                                                            isSelected
                                                                ? 'bg-[var(--background-calendar-selected)] text-white shadow-sm'
                                                                : isAvailable
                                                                  ? 'bg-[var(--background-calendar-range)] text-[var(--color-calendar-range)] hover:brightness-95'
                                                                  : ''
                                                        } ${day.getMonth() !== calendarMonth.getMonth() ? 'text-slate-300' : ''}`}
                                                    >
                                                        {day.getDate()}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </section>,
                                'h-[360px] overflow-hidden rounded-[22px] border border-[var(--color-app-border)] bg-[var(--background-calendar-panel)] shadow-[0_12px_30px_rgb(var(--rgb-app-ink)/0.07)]',
                            )}
                            {editable(
                                'schedule',
                                '여행 일정 상태',
                                <section className="flex h-full flex-col overflow-hidden rounded-[30px] bg-white p-6">
                                    <SectionTitle
                                        title={
                                            selectedItineraryDay
                                                ? `Day ${selectedItineraryDay.dayNumber}`
                                                : '선택 날짜 일정'
                                        }
                                        action={
                                            <button
                                                onClick={() =>
                                                    navigate(
                                                        `/app/room/${activeTrip.id}/schedule`,
                                                    )
                                                }
                                                disabled={!activeTrip.id}
                                                className="text-xs font-bold text-brand-700"
                                            >
                                                전체 일정
                                            </button>
                                        }
                                    />
                                    {selectedItineraryDay == null ? (
                                        <p className="flex flex-1 items-center justify-center text-center text-xs text-slate-400">
                                            달력에서 여행 날짜를 선택해 주세요.
                                        </p>
                                    ) : (
                                        <>
                                            <ol className="flex min-h-0 flex-1 flex-col justify-center gap-2 pt-3">
                                                {Array.from({
                                                    length: DASHBOARD_SCHEDULE_ITEM_LIMIT,
                                                }).map((_, index, slots) => {
                                                    const item =
                                                        selectedItineraryDay
                                                            .items[index]
                                                    return (
                                                        <li
                                                            key={
                                                                item?.id ??
                                                                `empty-${index}`
                                                            }
                                                            className="relative flex gap-4"
                                                        >
                                                            <div className="relative flex w-9 shrink-0 justify-center">
                                                                {index <
                                                                    slots.length -
                                                                        1 && (
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className="absolute left-1/2 top-8 h-[calc(100%+0.5rem)] -translate-x-1/2 border-l-2 border-dotted border-slate-200"
                                                                    />
                                                                )}
                                                                <span
                                                                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white text-xs font-black ${
                                                                        item ==
                                                                        null
                                                                            ? 'border-slate-200 bg-slate-50 text-slate-300'
                                                                            : 'shadow-sm'
                                                                    } ${
                                                                        focusedItemId ===
                                                                        String(
                                                                            item?.id,
                                                                        )
                                                                            ? 'border-[var(--color-brand)] text-[var(--color-brand)]'
                                                                            : item
                                                                              ? 'border-slate-400 text-slate-600'
                                                                              : ''
                                                                    }`}
                                                                >
                                                                    {index + 1}
                                                                </span>
                                                            </div>
                                                            {item ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setFocusedItemId(
                                                                            focusedItemId ===
                                                                                String(
                                                                                    item.id,
                                                                                )
                                                                                ? null
                                                                                : String(
                                                                                      item.id,
                                                                                  ),
                                                                        )
                                                                    }
                                                                    className={`min-w-0 flex-1 rounded-2xl px-4 py-2.5 text-left transition ${
                                                                        focusedItemId ===
                                                                        String(
                                                                            item.id,
                                                                        )
                                                                            ? 'bg-[var(--color-brand-surface-strong)]'
                                                                            : 'bg-slate-50 hover:bg-slate-100'
                                                                    }`}
                                                                >
                                                                    <b className="block truncate text-sm text-slate-800">
                                                                        {item.placeName ??
                                                                            '장소 미정'}
                                                                    </b>
                                                                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                                                        {item.placeAddress ??
                                                                            item.categoryName ??
                                                                            '상세 정보 없음'}
                                                                    </span>
                                                                </button>
                                                            ) : (
                                                                <div
                                                                    className="flex min-h-[55px] min-w-0 flex-1 flex-col justify-center rounded-2xl bg-slate-50 px-4"
                                                                    aria-label={`${index + 1}번째 빈 일정`}
                                                                >
                                                                    <span className="h-2.5 w-2/5 rounded-full bg-slate-200/80" />
                                                                    <span className="mt-2 h-2 w-3/4 rounded-full bg-slate-200/55" />
                                                                </div>
                                                            )}
                                                        </li>
                                                    )
                                                })}
                                            </ol>
                                            {selectedItineraryDay.items.length >
                                                DASHBOARD_SCHEDULE_ITEM_LIMIT && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        navigate(
                                                            `/app/room/${activeTrip.id}/schedule`,
                                                        )
                                                    }
                                                    className="mt-2 w-full rounded-xl bg-brand-50 px-3 py-2 text-xs font-extrabold text-brand-700 transition hover:bg-brand-100"
                                                >
                                                    +
                                                    {selectedItineraryDay.items
                                                        .length -
                                                        DASHBOARD_SCHEDULE_ITEM_LIMIT}
                                                    개의 일정이 더 있어요 · 전체
                                                    일정에서 보기
                                                </button>
                                            )}
                                        </>
                                    )}
                                </section>,
                                'h-[560px] min-h-[330px] overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_14px_35px_rgb(var(--rgb-app-ink)/0.07)]',
                            )}
                            <div className="hidden">
                                {editable(
                                    'expenses',
                                    '지출',
                                    <section className="rounded-[22px] border border-slate-100 p-5 shadow-sm">
                                        <SectionTitle
                                            title="지출"
                                            action={
                                                <CreditCardIcon
                                                    size={16}
                                                    className="text-slate-400"
                                                />
                                            }
                                        />
                                        <p className="text-xl font-extrabold text-slate-900">
                                            {currency(
                                                settlement?.totalExpense ?? 0,
                                            )}
                                        </p>
                                        {expenses.length === 0 ? (
                                            <p className="py-5 text-center text-xs text-slate-400">
                                                등록된 지출이 없습니다.
                                            </p>
                                        ) : (
                                            <div className="mt-3 space-y-2">
                                                {expenses
                                                    .slice(-3)
                                                    .reverse()
                                                    .map((expense) => (
                                                        <div
                                                            key={expense.id}
                                                            className="flex justify-between gap-3 text-xs"
                                                        >
                                                            <span className="truncate text-slate-500">
                                                                DAY{' '}
                                                                {
                                                                    expense.dayNumber
                                                                }{' '}
                                                                ·{' '}
                                                                {expense.title}
                                                            </span>
                                                            <b className="shrink-0 text-slate-700">
                                                                {currency(
                                                                    expense.totalAmount,
                                                                )}
                                                            </b>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </section>,
                                )}
                                {editable(
                                    'notifications',
                                    '알림',
                                    <NotificationPanel
                                        maxItems={4}
                                        onViewAll={() =>
                                            navigate('/app/updates')
                                        }
                                    />,
                                )}
                            </div>
                        </aside>
                    </main>
                </>
            )}
            {createTripOpen && (
                <CreateTripModal
                    onClose={() => setCreateTripOpen(false)}
                    onCreated={async (tripId) => {
                        setCreateTripOpen(false)
                        await loadTrips()
                        const roomId = String(tripId)
                        selectTrip(roomId)
                        navigate(`/app/room/${roomId}`)
                    }}
                />
            )}
            {expenseComposerOpen &&
                activeTrip.apiTripId != null &&
                typeof document !== 'undefined' &&
                createPortal(
                    <ExpensePanel
                        tripId={activeTrip.apiTripId}
                        canWrite
                        composerOnly
                        initialComposerOpen
                        onComposerClose={() => setExpenseComposerOpen(false)}
                        onChanged={() => {
                            const tripId = activeTrip.apiTripId
                            if (tripId == null) return

                            void fetchExpenseData(tripId).then(
                                (expenseData) => {
                                    setExpenses(expenseData.expenses)
                                    setSettlement(expenseData.settlement)
                                },
                            )
                        }}
                    />,
                    document.body,
                )}
        </div>
    )
}
