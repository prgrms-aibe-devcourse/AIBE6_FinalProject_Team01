'use client'

import {
    type FormEvent,
    type ReactNode,
    type SyntheticEvent,
    useEffect,
    useState,
} from 'react'
import {
    BadgeCheckIcon,
    BookmarkIcon,
    CalendarPlusIcon,
    CalendarDaysIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    LoaderCircleIcon,
    ListIcon,
    MapPinIcon,
    SearchIcon,
    SearchXIcon,
    PanelLeftCloseIcon,
    XIcon,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import {
    fetchPublicCardDetail,
    filterPublicRecordsForDay,
    ItineraryCopyFlow,
    mergePublicRecordsWithItinerary,
    type CardSort,
    type PublicCard,
    type PublicCardDetail,
    useExploreCardStore,
} from '@/features/explore-card'
import { REALTIME_EVENT_NAME, type RealtimeEvent } from '@/shared/lib'
import { resolveMediaUrl } from '@/shared/api/client'
import { KanbanMapPanel } from '@/widgets/trip-room'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from './page-header'

const SORTS: { value: CardSort; label: string }[] = [
    { value: 'LATEST', label: '최신순' },
    { value: 'POPULAR', label: '인기순' },
]

const TRAVEL_STYLE_LABELS: Record<string, string> = {
    ACTIVITY: '액티비티',
    SNS_HOT_PLACE: 'SNS 핫플레이스',
    NATURE: '자연과 함께',
    FAMOUS_ATTRACTIONS: '유명관광지 필수',
    RELAXATION: '여유롭게 힐링',
    CULTURE_ART_HISTORY: '문화/예술/역사',
    SHOPPING: '쇼핑',
    FOOD: '맛집 먹거리',
}

const TRAVEL_STYLE_FILTERS = Object.entries(TRAVEL_STYLE_LABELS).map(
    ([value, label]) => ({ value, label }),
)

const DEFAULT_COVER_IMAGE = '/ec246eb2-6c56-4a2e-aa65-d09ffc9a62c9.jpg'

function fallbackToDefaultCoverImage(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    if (image.dataset.coverFallbackApplied) return
    image.dataset.coverFallbackApplied = 'true'
    image.src = DEFAULT_COVER_IMAGE
}

function DetailTagPills({
    detail,
    variant = 'light',
}: {
    detail: PublicCardDetail
    variant?: 'light' | 'dark'
}) {
    if (detail.travelStyles.length === 0 && detail.tags.length === 0) {
        return null
    }
    const styleClass =
        variant === 'dark'
            ? 'rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm'
            : 'rounded-full bg-[var(--color-app-navy)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-app-navy)]'
    const tagClass =
        variant === 'dark'
            ? 'rounded-full bg-white/25 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm'
            : 'rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700'
    return (
        <div className="flex flex-wrap gap-2">
            {detail.travelStyles.map((style) => (
                <span key={style} className={styleClass}>
                    #{TRAVEL_STYLE_LABELS[style] ?? style}
                </span>
            ))}
            {detail.tags.map((tag) => (
                <span key={tag} className={tagClass}>
                    #{tag}
                </span>
            ))}
        </div>
    )
}

function CoverCard({
    coverImageUrl,
    badges,
    authorBlock,
    title,
    summary,
    detail,
    ctaLabel,
    onCta,
    state,
}: {
    coverImageUrl: string | null
    badges: ReactNode
    authorBlock?: ReactNode
    title: string
    summary: string | null
    detail: PublicCardDetail
    ctaLabel: string
    onCta: () => void
    state: 'front' | 'back' | 'hidden'
}) {
    const translateClass =
        state === 'front'
            ? 'translate-x-0'
            : state === 'back'
              ? 'translate-x-5 -translate-y-5'
              : '-translate-x-[120%]'
    const zIndexClass =
        state === 'front' ? 'z-20' : state === 'back' ? 'z-10' : 'z-0'
    return (
        <section
            className={`absolute inset-y-6 left-4 ${zIndexClass} flex w-[min(560px,calc(100%-2rem))] flex-col overflow-hidden rounded-[26px] border border-white/70 bg-slate-900 shadow-[0_24px_60px_rgb(var(--rgb-app-ink)/0.25)] transition-transform duration-300 ease-out ${translateClass}`}
            aria-hidden={state !== 'front'}
        >
            <img
                src={coverImageUrl ?? DEFAULT_COVER_IMAGE}
                onError={fallbackToDefaultCoverImage}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/10" />
            <div className="absolute left-5 top-5 flex items-center gap-2">
                {badges}
            </div>
            <div className="relative z-10 mt-auto flex flex-col gap-4 p-5 pb-7 text-white sm:p-7">
                {authorBlock}
                <div>
                    <h1 className="text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                        {title}
                    </h1>
                    {summary && (
                        <p className="mt-2 text-sm leading-6 text-white/80">
                            {summary}
                        </p>
                    )}
                </div>
                <DetailTagPills detail={detail} variant="dark" />
                <button
                    type="button"
                    onClick={onCta}
                    tabIndex={state === 'front' ? 0 : -1}
                    className="mt-1 flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-white/90"
                >
                    {ctaLabel}
                    <ChevronRightIcon size={16} />
                </button>
            </div>
        </section>
    )
}

export function Explore() {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const [submittedQuery, setSubmittedQuery] = useState('')
    const [sort, setSort] = useState<CardSort>('LATEST')
    const [selectedTravelStyle, setSelectedTravelStyle] = useState<
        string | null
    >(null)
    const [page, setPage] = useState(0)
    const [copyCard, setCopyCard] = useState<PublicCard | null>(null)
    const data = useExploreCardStore((state) => state.data)
    const isLoading = useExploreCardStore((state) => state.isLoading)
    const error = useExploreCardStore((state) => state.error)
    const loadCards = useExploreCardStore((state) => state.loadCards)
    const toggleBookmark = useExploreCardStore((state) => state.toggleBookmark)

    useEffect(() => {
        void loadCards(page, sort, submittedQuery, selectedTravelStyle)
    }, [loadCards, page, selectedTravelStyle, sort, submittedQuery])

    useEffect(() => {
        const handleRealtimeChange = (event: Event) => {
            const detail = (event as CustomEvent<RealtimeEvent>).detail
            if (detail.type !== 'PUBLIC_CARD_CHANGED') return
            void loadCards(page, sort, submittedQuery, selectedTravelStyle)
        }
        window.addEventListener(REALTIME_EVENT_NAME, handleRealtimeChange)
        return () =>
            window.removeEventListener(
                REALTIME_EVENT_NAME,
                handleRealtimeChange,
            )
    }, [loadCards, page, selectedTravelStyle, sort, submittedQuery])

    function search(event: FormEvent) {
        event.preventDefault()
        setPage(0)
        setSubmittedQuery(query.trim())
    }

    return (
        <div className="min-h-full bg-[var(--color-app-background)] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
            <div className="mx-auto max-w-[1500px]">
                <div className="flex flex-row items-center justify-between gap-5">
                    <PageHeader
                        eyebrow="DISCOVER"
                        title="둘러보기"
                        description="다른 여행자들이 공개한 완료 여행 카드를 둘러보세요."
                    />
                    <form
                        onSubmit={search}
                        className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm sm:rounded-full sm:px-4 lg:max-w-md"
                    >
                        <SearchIcon
                            size={17}
                            className="shrink-0 text-slate-400"
                        />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="제목, 태그, 작성자로 검색"
                            aria-label="공개 여행 카드 검색어"
                            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400"
                        />
                        <button
                            type="submit"
                            className="shrink-0 whitespace-nowrap rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white"
                        >
                            검색
                        </button>
                    </form>
                </div>

                <div className="mt-5 flex flex-row items-center justify-between gap-3">
                    <div
                        className="mp-scroll flex min-w-0 gap-2 overflow-x-auto pb-1"
                        aria-label="여행 스타일 필터"
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedTravelStyle(null)
                                setPage(0)
                            }}
                            aria-pressed={selectedTravelStyle === null}
                            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                                selectedTravelStyle === null
                                    ? 'bg-[var(--color-app-navy)] text-white shadow-sm'
                                    : 'border border-slate-200 bg-white text-[var(--color-app-navy)] hover:border-[var(--color-app-navy)]/40'
                            }`}
                        >
                            전체
                        </button>
                        {TRAVEL_STYLE_FILTERS.map((style) => (
                            <button
                                key={style.value}
                                type="button"
                                onClick={() => {
                                    setSelectedTravelStyle(style.value)
                                    setPage(0)
                                }}
                                aria-pressed={
                                    selectedTravelStyle === style.value
                                }
                                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                                    selectedTravelStyle === style.value
                                        ? 'bg-[var(--color-app-navy)] text-white shadow-sm'
                                        : 'border border-slate-200 bg-white text-[var(--color-app-navy)] hover:border-[var(--color-app-navy)]/40'
                                }`}
                            >
                                #{style.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex w-fit shrink-0 rounded-[18px] bg-slate-100 p-1.5">
                        {SORTS.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() => {
                                    setSort(item.value)
                                    setPage(0)
                                }}
                                aria-pressed={sort === item.value}
                                className={`shrink-0 whitespace-nowrap rounded-[14px] px-5 py-2.5 text-sm font-extrabold transition-colors ${
                                    sort === item.value
                                        ? 'bg-brand text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">
                        {error}
                    </p>
                )}

                {isLoading && !data && (
                    <div className="flex justify-center py-24 text-brand-700">
                        <LoaderCircleIcon className="animate-spin" />
                    </div>
                )}

                {!isLoading && !error && data?.content.length === 0 && (
                    <div className="mt-10 rounded-[22px] bg-white py-20 text-center sm:py-24">
                        <SearchXIcon className="mx-auto text-slate-300" />
                        <p className="mt-3 font-bold">
                            {selectedTravelStyle
                                ? '이 스타일로 공개된 여행이 아직 없어요.'
                                : '공개된 여행 카드가 없습니다.'}
                        </p>
                    </div>
                )}

                <div className="mt-5 grid auto-rows-fr grid-cols-3 gap-5">
                    {data?.content.map((card) => (
                        <TravelCard
                            key={card.id}
                            card={card}
                            onBookmark={() => void toggleBookmark(card.id)}
                            onCopy={() => setCopyCard(card)}
                            onOpen={() => navigate(`/app/explore/${card.id}`)}
                        />
                    ))}
                </div>

                {(data?.totalPages ?? 0) > 1 && (
                    <nav
                        aria-label="둘러보기 페이지"
                        className="mt-4 flex shrink-0 flex-wrap justify-center gap-2 pb-1"
                    >
                        <PageButton
                            label="이전 페이지"
                            disabled={page === 0}
                            onClick={() => setPage((current) => current - 1)}
                        >
                            <ChevronLeftIcon size={16} />
                        </PageButton>
                        {Array.from(
                            { length: data?.totalPages ?? 0 },
                            (_, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => setPage(index)}
                                    aria-current={
                                        page === index ? 'page' : undefined
                                    }
                                    className={`h-9 w-9 rounded-full text-xs font-bold ${
                                        page === index
                                            ? 'bg-brand text-white'
                                            : 'bg-white text-slate-600'
                                    }`}
                                >
                                    {index + 1}
                                </button>
                            ),
                        )}
                        <PageButton
                            label="다음 페이지"
                            disabled={page + 1 >= (data?.totalPages ?? 0)}
                            onClick={() => setPage((current) => current + 1)}
                        >
                            <ChevronRightIcon size={16} />
                        </PageButton>
                    </nav>
                )}
            </div>

            {copyCard && (
                <ItineraryCopyFlow
                    card={copyCard}
                    onClose={() => setCopyCard(null)}
                />
            )}
        </div>
    )
}

export function TravelCard({
    card,
    onBookmark,
    onCopy,
    onOpen,
    onShare,
}: {
    card: PublicCard
    onBookmark: () => void
    onCopy: () => void
    onOpen: () => void
    onShare?: () => void
}) {
    return (
        <article
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onOpen()
            }}
            className="relative flex aspect-[4/3] h-full min-w-0 cursor-pointer flex-col border-0 shadow-none outline-none ring-0 transition hover:-translate-y-0.5 focus:outline-none focus-visible:outline-none"
        >
            <img
                src={resolveMediaUrl(card.coverImageUrl) ?? DEFAULT_COVER_IMAGE}
                onError={fallbackToDefaultCoverImage}
                alt=""
                className="absolute inset-0 h-full w-full rounded-[28px] object-cover"
            />
            {card.ownCard && (
                <span
                    title="내가 참여한 여행 카드"
                    className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-[11px] font-extrabold text-brand-700 shadow-sm backdrop-blur-sm"
                >
                    <BadgeCheckIcon size={14} />내 여행 카드
                </span>
            )}
            <div className="absolute -inset-x-px -bottom-px z-10 flex h-[177px] flex-col justify-end gap-2 rounded-b-[28px] bg-gradient-to-t from-white via-white/85 to-white/0 px-[17px] pb-[17px] pt-16 text-slate-900">
                <div className="min-w-0 shrink-0">
                    <h2 className="truncate text-lg font-black tracking-[-0.03em]">
                        {card.title}
                    </h2>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-slate-500">
                        <MapPinIcon size={13} className="shrink-0 text-brand" />
                        <span className="truncate">
                            {card.destination ?? '여행지 미정'}
                        </span>
                    </p>
                </div>
                <div className="flex h-6 shrink-0 flex-nowrap gap-1.5 overflow-hidden">
                    {card.travelStyles.map((style) => (
                        <span
                            key={style}
                            className="max-w-full shrink-0 truncate rounded-full bg-[var(--color-app-navy)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--color-app-navy)]"
                        >
                            #{TRAVEL_STYLE_LABELS[style] ?? style}
                        </span>
                    ))}
                    {card.tags.map((tag) => (
                        <span
                            key={tag}
                            className="max-w-full shrink-0 truncate rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700"
                        >
                            #{tag}
                        </span>
                    ))}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 pt-1 text-xs">
                    {card.ownCard ? (
                        <span
                            className="flex items-center gap-1.5 font-extrabold text-brand-700"
                            aria-label={`${card.bookmarkCount}명이 여행자 PICK으로 저장함`}
                        >
                            <BookmarkIcon size={15} fill="currentColor" />
                            {card.bookmarkCount}명이 PICK
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation()
                                onBookmark()
                            }}
                            className="flex items-center gap-1.5 font-extrabold text-brand-700"
                            aria-label={
                                card.bookmarked
                                    ? '여행자 PICK 취소'
                                    : '여행자 PICK'
                            }
                        >
                            <BookmarkIcon
                                size={15}
                                fill={card.bookmarked ? 'currentColor' : 'none'}
                            />
                            여행자 PICK {card.bookmarkCount}
                        </button>
                    )}
                    {!card.ownCard && (
                        <div className="flex gap-1.5">
                            {onShare && (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onShare()
                                    }}
                                    className="rounded-full border border-brand-100 bg-white px-3 py-2 font-extrabold text-brand-700"
                                >
                                    공유
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onCopy()
                                }}
                                className="flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3.5 py-2 font-extrabold text-white transition hover:bg-brand-700"
                            >
                                <CalendarPlusIcon size={15} /> 일정 담기
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </article>
    )
}

export function ExploreDetail() {
    const navigate = useNavigate()
    const { cardId } = useParams()
    const [detail, setDetail] = useState<PublicCardDetail | null>(null)
    const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
    const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
    const [view, setView] = useState<'cover' | 'panel' | 'map'>('cover')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const parsedCardId = Number(cardId)
        if (!Number.isInteger(parsedCardId) || parsedCardId <= 0) {
            Promise.resolve().then(() => {
                setError('잘못된 여행 카드 주소입니다.')
                setIsLoading(false)
            })
            return
        }

        let cancelled = false
        void fetchPublicCardDetail(parsedCardId)
            .then((response) => {
                if (cancelled) return
                setDetail(response)
                setSelectedDayId(
                    response.itinerary[0]
                        ? String(response.itinerary[0].id)
                        : null,
                )
                setError(null)
            })
            .catch((caught: unknown) => {
                if (cancelled) return
                setError(
                    caught instanceof Error
                        ? caught.message
                        : '여행 상세 정보를 불러오지 못했습니다.',
                )
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [cardId])

    const isAllDays = selectedDayId === 'all'
    const selectedDay = isAllDays
        ? null
        : (detail?.itinerary.find((day) => String(day.id) === selectedDayId) ??
          detail?.itinerary[0] ??
          null)
    const displayedDays = isAllDays
        ? (detail?.itinerary ?? [])
        : selectedDay
          ? [selectedDay]
          : []

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center bg-[var(--color-app-background)] text-brand">
                <LoaderCircleIcon className="animate-spin" size={28} />
            </div>
        )
    }

    if (error || !detail) {
        return (
            <div className="flex h-full flex-col items-center justify-center bg-[var(--color-app-background)] px-6 text-center">
                <SearchXIcon size={32} className="text-slate-300" />
                <p className="mt-4 text-sm font-bold text-slate-600">
                    {error ?? '여행 카드를 찾을 수 없습니다.'}
                </p>
                <button
                    type="button"
                    onClick={() => navigate('/app/explore')}
                    className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-extrabold text-white"
                >
                    둘러보기로 돌아가기
                </button>
            </div>
        )
    }

    if (detail.visibility === 'PUBLIC_RECORD') {
        return (
            <PublicRecordDetail
                detail={detail}
                selectedDayId={selectedDayId}
                onSelectDay={setSelectedDayId}
                onBack={() => navigate('/app/explore')}
            />
        )
    }

    const coverImageUrl = resolveMediaUrl(detail.coverImageUrl)

    return (
        <div className="flex min-h-full flex-col bg-[var(--color-app-background)] p-4 sm:p-6 xl:h-full xl:min-h-0 xl:overflow-hidden">
            <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => navigate('/app/explore')}
                    className="flex items-center gap-1.5 text-sm font-extrabold text-slate-500 transition hover:text-brand-700"
                >
                    <ChevronLeftIcon size={18} />
                    둘러보기
                </button>
                <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-extrabold text-brand-700">
                    공개 여행 일정
                </span>
            </header>

            <main className="relative min-h-[680px] flex-1 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 shadow-[0_20px_50px_rgb(var(--rgb-app-ink)/0.08)] xl:min-h-0">
                <section className="absolute inset-0 overflow-hidden bg-slate-100">
                    {displayedDays.length > 0 ? (
                        <div className="h-full [&>div]:h-full [&>div]:border-0 [&>div>button]:hidden [&>div>div]:h-full">
                            <KanbanMapPanel
                                days={displayedDays}
                                places={[]}
                                activeDragId={null}
                                previewDayId={null}
                                hoveredItemId={null}
                                onItemHoverChange={() => undefined}
                                focusedItemId={focusedItemId}
                                focusedPlaceId={null}
                                onItemFocus={setFocusedItemId}
                                onPlaceFocus={() => undefined}
                            />
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-slate-400">
                            지도에 표시할 일정 장소가 없습니다.
                        </div>
                    )}
                </section>

                <section
                    className={`mp-scroll absolute inset-y-6 left-4 w-[min(560px,calc(100%-2rem))] overflow-y-auto rounded-[26px] border border-white/70 bg-white shadow-[0_24px_60px_rgb(var(--rgb-app-ink)/0.2)] transition-transform duration-300 ease-out ${
                        view === 'panel'
                            ? 'z-20 translate-x-0'
                            : view === 'cover'
                              ? 'z-10 translate-x-5 -translate-y-5'
                              : 'z-0 -translate-x-[120%]'
                    }`}
                    aria-hidden={view !== 'panel'}
                >
                    <div className="flex items-center justify-end gap-2 p-5 pb-3 sm:px-7 sm:pt-6">
                        <button
                            type="button"
                            onClick={() => setView('cover')}
                            className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600 transition hover:bg-slate-200"
                        >
                            <ChevronLeftIcon size={14} />
                            커버
                        </button>
                        <button
                            type="button"
                            onClick={() => setView('map')}
                            aria-label="일정 목록 접기"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:text-brand-700"
                        >
                            <PanelLeftCloseIcon size={16} />
                        </button>
                    </div>

                    <div className="px-5 pb-5 sm:px-7">
                        <h1 className="truncate text-lg font-black tracking-[-0.03em] text-slate-950">
                            {detail.title}
                        </h1>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                            <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-2">
                                <MapPinIcon size={14} className="text-brand" />
                                {detail.destination ?? '여행지 미정'}
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-2">
                                <CalendarDaysIcon
                                    size={14}
                                    className="text-brand"
                                />
                                {formatPublicTripDates(
                                    detail.startDate,
                                    detail.endDate,
                                )}
                            </span>
                        </div>

                        <div className="mt-6 border-t border-slate-100 pt-5">
                            <div className="mp-scroll flex gap-2 overflow-x-auto pb-2">
                                {detail.itinerary.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedDayId('all')
                                            setFocusedItemId(null)
                                        }}
                                        className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${
                                            isAllDays
                                                ? 'bg-brand text-white'
                                                : 'bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-700'
                                        }`}
                                    >
                                        전체 일정
                                    </button>
                                )}
                                {detail.itinerary.map((day) => (
                                    <button
                                        key={day.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedDayId(String(day.id))
                                            setFocusedItemId(null)
                                        }}
                                        className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${
                                            selectedDay?.id === day.id
                                                ? 'bg-brand text-white'
                                                : 'bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-700'
                                        }`}
                                    >
                                        Day {day.dayNumber}
                                    </button>
                                ))}
                            </div>

                            {displayedDays.length === 0 ? (
                                <div className="mt-8 rounded-[22px] border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
                                    공개된 일정이 없습니다.
                                </div>
                            ) : (
                                <PublicItineraryDays
                                    days={displayedDays}
                                    focusedItemId={focusedItemId}
                                    onFocusItem={setFocusedItemId}
                                />
                            )}
                        </div>
                    </div>
                </section>

                <CoverCard
                    coverImageUrl={coverImageUrl}
                    state={
                        view === 'cover'
                            ? 'front'
                            : view === 'panel'
                              ? 'back'
                              : 'hidden'
                    }
                    badges={
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-brand-700 shadow-sm">
                            ITINERARY
                        </span>
                    }
                    title={detail.title}
                    summary={
                        detail.summary ??
                        '공개된 여행의 날짜별 장소와 이동 경로를 확인해 보세요.'
                    }
                    detail={detail}
                    ctaLabel="Day별 기록 보기"
                    onCta={() => setView('panel')}
                />

                {view === 'map' && (
                    <button
                        type="button"
                        onClick={() => setView('panel')}
                        aria-label="일정 목록 열기"
                        className="flamingo-gradient flamingo-glow absolute left-5 top-5 z-30 flex h-12 w-12 items-center justify-center rounded-2xl text-white transition hover:scale-105"
                    >
                        <ListIcon size={21} />
                    </button>
                )}
            </main>
        </div>
    )
}

function PublicRecordDetail({
    detail,
    selectedDayId,
    onSelectDay,
    onBack,
}: {
    detail: PublicCardDetail
    selectedDayId: string | null
    onSelectDay: (dayId: string) => void
    onBack: () => void
}) {
    const [view, setView] = useState<'cover' | 'panel' | 'map'>('cover')
    const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
    const selectedDay =
        detail.itinerary.find((day) => String(day.id) === selectedDayId) ??
        detail.itinerary[0] ??
        null
    const records = selectedDay
        ? filterPublicRecordsForDay(detail.records, selectedDay)
        : detail.records
    const timelineEntries = selectedDay
        ? mergePublicRecordsWithItinerary(detail.records, selectedDay)
        : records.map((record) => ({
              kind: 'record' as const,
              itineraryItem: null,
              record,
          }))
    const displayedDays = selectedDay ? [selectedDay] : []
    const photoCount = detail.records.reduce(
        (total, record) => total + record.imageUrls.length,
        0,
    )
    const authorNickname = detail.records[0]?.recordedByNickname ?? '여행자'
    const coverImageUrl = resolveMediaUrl(detail.coverImageUrl)

    return (
        <div className="flex min-h-full flex-col bg-[var(--color-app-background)] p-4 sm:p-6 xl:h-full xl:min-h-0 xl:overflow-hidden">
            <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-sm font-extrabold text-slate-500 transition hover:text-brand-700"
                >
                    <ChevronLeftIcon size={18} />
                    둘러보기
                </button>
                <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-extrabold text-brand-700">
                    공개 여행 기록
                </span>
            </header>

            <main className="relative min-h-[680px] flex-1 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 shadow-[0_20px_50px_rgb(var(--rgb-app-ink)/0.08)] xl:min-h-0">
                <section className="absolute inset-0 overflow-hidden bg-slate-100">
                    {displayedDays.length > 0 ? (
                        <div className="h-full [&>div]:h-full [&>div]:border-0 [&>div>button]:hidden [&>div>div]:h-full">
                            <KanbanMapPanel
                                days={displayedDays}
                                places={[]}
                                activeDragId={null}
                                previewDayId={null}
                                hoveredItemId={null}
                                onItemHoverChange={() => undefined}
                                focusedItemId={focusedItemId}
                                focusedPlaceId={null}
                                onItemFocus={setFocusedItemId}
                                onPlaceFocus={() => undefined}
                            />
                        </div>
                    ) : (
                        <div className="h-full bg-gradient-to-br from-sky-50 to-stone-100" />
                    )}
                </section>

                <section
                    className={`mp-scroll absolute inset-y-6 left-4 w-[min(560px,calc(100%-2rem))] overflow-y-auto rounded-[26px] border border-white/70 bg-white shadow-[0_24px_60px_rgb(var(--rgb-app-ink)/0.2)] transition-transform duration-300 ease-out ${
                        view === 'panel'
                            ? 'z-20 translate-x-0'
                            : view === 'cover'
                              ? 'z-10 translate-x-5 -translate-y-5'
                              : 'z-0 -translate-x-[120%]'
                    }`}
                    aria-hidden={view !== 'panel'}
                >
                    <div className="flex items-center justify-end gap-2 p-5 pb-3 sm:px-7 sm:pt-6">
                        <button
                            type="button"
                            onClick={() => setView('cover')}
                            className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600 transition hover:bg-slate-200"
                        >
                            <ChevronLeftIcon size={14} />
                            커버
                        </button>
                        <button
                            type="button"
                            onClick={() => setView('map')}
                            aria-label="여행 기록 접기"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:text-brand-700"
                        >
                            <PanelLeftCloseIcon size={16} />
                        </button>
                    </div>

                    <div className="px-5 pb-8 sm:px-7">
                        <h1 className="truncate text-lg font-black tracking-[-0.03em] text-slate-950">
                            {detail.title}
                        </h1>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                            <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-2">
                                <MapPinIcon size={14} className="text-brand" />
                                {detail.destination ?? '여행지 미정'}
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-2">
                                <CalendarDaysIcon
                                    size={14}
                                    className="text-brand"
                                />
                                {formatPublicTripDates(
                                    detail.startDate,
                                    detail.endDate,
                                )}
                            </span>
                        </div>

                        <div className="mp-scroll mt-5 flex gap-2 overflow-x-auto border-b border-slate-100 pb-5">
                            {detail.itinerary.map((day) => (
                                <button
                                    key={day.id}
                                    type="button"
                                    onClick={() => {
                                        onSelectDay(String(day.id))
                                        setFocusedItemId(null)
                                    }}
                                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${
                                        selectedDay?.id === day.id
                                            ? 'bg-brand text-white'
                                            : 'bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-700'
                                    }`}
                                >
                                    Day {day.dayNumber}
                                </button>
                            ))}
                        </div>

                        <div className="mt-5 flex items-end justify-between gap-3">
                            <h2 className="text-xl font-black text-slate-900">
                                Day {selectedDay?.dayNumber ?? 1}
                                <span className="mx-3 text-slate-200">|</span>
                                <span className="text-base text-slate-400">
                                    {selectedDay?.itineraryDate ?? '날짜 미정'}
                                </span>
                            </h2>
                            <span className="text-xs font-bold text-slate-400">
                                {selectedDay
                                    ? `${selectedDay.items.length}곳 중 ${records.length}곳 기록`
                                    : `${records.length}개 기록`}
                            </span>
                        </div>

                        {timelineEntries.length === 0 ? (
                            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 py-20 text-center text-sm font-semibold text-slate-400">
                                이 날짜에 등록된 일정이 없습니다.
                            </div>
                        ) : (
                            <ol className="mt-6 space-y-7">
                                {timelineEntries.map((entry, index) => (
                                    <li
                                        key={
                                            entry.kind === 'record'
                                                ? `record-${entry.record.id}`
                                                : `itinerary-${entry.itineraryItem.id}`
                                        }
                                        className="relative pl-10"
                                    >
                                        <span
                                            className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${
                                                entry.kind === 'record'
                                                    ? 'bg-brand text-white'
                                                    : 'border-2 border-dashed border-slate-300 bg-white text-slate-400'
                                            }`}
                                        >
                                            {index + 1}
                                        </span>
                                        {index < timelineEntries.length - 1 && (
                                            <span className="absolute bottom-[-1.75rem] left-[15px] top-9 border-l-2 border-dotted border-brand-100" />
                                        )}
                                        {entry.kind === 'itinerary' ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setFocusedItemId(
                                                        focusedItemId ===
                                                            String(
                                                                entry
                                                                    .itineraryItem
                                                                    .id,
                                                            )
                                                            ? null
                                                            : String(
                                                                  entry
                                                                      .itineraryItem
                                                                      .id,
                                                              ),
                                                    )
                                                }
                                                className={`w-full rounded-[22px] border border-dashed bg-white p-5 text-left transition ${
                                                    focusedItemId ===
                                                    String(
                                                        entry.itineraryItem.id,
                                                    )
                                                        ? 'border-brand bg-brand-50'
                                                        : 'border-slate-300 hover:border-brand-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-lg font-black text-slate-900">
                                                                {entry
                                                                    .itineraryItem
                                                                    .placeName ??
                                                                    '장소 미정'}
                                                            </h3>
                                                            {entry.itineraryItem
                                                                .categoryName && (
                                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                                                    {
                                                                        entry
                                                                            .itineraryItem
                                                                            .categoryName
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                        {entry.itineraryItem
                                                            .placeAddress && (
                                                            <p className="mt-1 text-xs font-semibold text-slate-400">
                                                                {
                                                                    entry
                                                                        .itineraryItem
                                                                        .placeAddress
                                                                }
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                                        일정 장소
                                                    </span>
                                                </div>
                                                <p className="mt-5 text-sm font-semibold text-slate-400">
                                                    작성된 여행 기록이 없습니다.
                                                </p>
                                            </button>
                                        ) : (
                                            <article
                                                role={
                                                    entry.itineraryItem
                                                        ? 'button'
                                                        : undefined
                                                }
                                                tabIndex={
                                                    entry.itineraryItem
                                                        ? 0
                                                        : undefined
                                                }
                                                onClick={() => {
                                                    if (!entry.itineraryItem)
                                                        return
                                                    const itemId = String(
                                                        entry.itineraryItem.id,
                                                    )
                                                    setFocusedItemId(
                                                        focusedItemId === itemId
                                                            ? null
                                                            : itemId,
                                                    )
                                                }}
                                                onKeyDown={(event) => {
                                                    if (
                                                        !entry.itineraryItem ||
                                                        (event.key !==
                                                            'Enter' &&
                                                            event.key !== ' ')
                                                    )
                                                        return
                                                    event.preventDefault()
                                                    const itemId = String(
                                                        entry.itineraryItem.id,
                                                    )
                                                    setFocusedItemId(
                                                        focusedItemId === itemId
                                                            ? null
                                                            : itemId,
                                                    )
                                                }}
                                                className={`rounded-[22px] border bg-white p-5 shadow-[0_10px_28px_rgb(var(--rgb-app-ink)/0.07)] transition ${
                                                    entry.itineraryItem &&
                                                    focusedItemId ===
                                                        String(
                                                            entry.itineraryItem
                                                                .id,
                                                        )
                                                        ? 'border-brand bg-brand-50'
                                                        : entry.itineraryItem
                                                          ? 'cursor-pointer border-slate-100 hover:border-brand-200'
                                                          : 'border-slate-100'
                                                }`}
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3
                                                                className={`text-lg font-black transition ${
                                                                    entry.itineraryItem &&
                                                                    focusedItemId ===
                                                                        String(
                                                                            entry
                                                                                .itineraryItem
                                                                                .id,
                                                                        )
                                                                        ? 'text-brand-700'
                                                                        : 'text-slate-900'
                                                                }`}
                                                            >
                                                                {
                                                                    entry.record
                                                                        .placeName
                                                                }
                                                            </h3>
                                                            {entry.record
                                                                .categoryName && (
                                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                                                    {
                                                                        entry
                                                                            .record
                                                                            .categoryName
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                                            {[
                                                                entry.record
                                                                    .categoryName,
                                                                entry.record
                                                                    .address,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(' · ')}
                                                        </p>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-400">
                                                        {
                                                            entry.record
                                                                .recordedByNickname
                                                        }
                                                    </span>
                                                </div>
                                                {entry.record.memo && (
                                                    <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                                                        {entry.record.memo}
                                                    </p>
                                                )}
                                                <div
                                                    onClick={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                    onKeyDown={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                >
                                                    <RecordPhotoGrid
                                                        imageUrls={
                                                            entry.record
                                                                .imageUrls
                                                        }
                                                        placeName={
                                                            entry.record
                                                                .placeName
                                                        }
                                                    />
                                                </div>
                                            </article>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </section>

                <CoverCard
                    coverImageUrl={coverImageUrl}
                    state={
                        view === 'cover'
                            ? 'front'
                            : view === 'panel'
                              ? 'back'
                              : 'hidden'
                    }
                    badges={
                        <>
                            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-brand-700 shadow-sm">
                                TRAVEL LOG
                            </span>
                            <span className="rounded-full bg-slate-900/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
                                사진 {photoCount} · 후기 {detail.records.length}
                            </span>
                        </>
                    }
                    authorBlock={
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-sm font-black text-slate-600 shadow-sm">
                                {authorNickname.slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-white">
                                    {authorNickname}님의 여행기
                                </p>
                                <p className="mt-0.5 text-xs text-white/80">
                                    {formatPublicTripDates(
                                        detail.startDate,
                                        detail.endDate,
                                    )}{' '}
                                    공개
                                </p>
                            </div>
                        </div>
                    }
                    title={detail.title}
                    summary={detail.summary}
                    detail={detail}
                    ctaLabel="Day별 기록 보기"
                    onCta={() => setView('panel')}
                />

                {view === 'map' && (
                    <button
                        type="button"
                        onClick={() => setView('panel')}
                        aria-label="여행 기록 열기"
                        className="flamingo-gradient flamingo-glow absolute left-5 top-5 z-30 flex h-12 w-12 items-center justify-center rounded-2xl text-white transition hover:scale-105"
                    >
                        <ListIcon size={21} />
                    </button>
                )}
            </main>
        </div>
    )
}

function RecordPhotoGrid({
    imageUrls,
    placeName,
}: {
    imageUrls: string[]
    placeName: string
}) {
    const [previewIndex, setPreviewIndex] = useState<number | null>(null)

    useEffect(() => {
        if (previewIndex === null) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setPreviewIndex(null)
                return
            }
            if (event.key === 'ArrowLeft') {
                setPreviewIndex((current) =>
                    current === null
                        ? null
                        : (current - 1 + imageUrls.length) % imageUrls.length,
                )
            }
            if (event.key === 'ArrowRight') {
                setPreviewIndex((current) =>
                    current === null ? null : (current + 1) % imageUrls.length,
                )
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [imageUrls.length, previewIndex])

    if (imageUrls.length === 0) return null

    const visibleImages = imageUrls.slice(0, 3)
    const remainingCount = imageUrls.length - visibleImages.length

    if (visibleImages.length === 1) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setPreviewIndex(0)}
                    aria-label={`${placeName} 여행 사진 크게 보기`}
                    className="mt-5 block w-full overflow-hidden rounded-[20px]"
                >
                    <img
                        src={resolveMediaUrl(visibleImages[0]) ?? undefined}
                        alt={`${placeName} 여행 사진`}
                        className="max-h-[340px] w-full object-cover transition duration-300 hover:scale-[1.015]"
                    />
                </button>
                <RecordPhotoPreview
                    imageUrls={imageUrls}
                    placeName={placeName}
                    previewIndex={previewIndex}
                    onPreviewIndexChange={setPreviewIndex}
                />
            </>
        )
    }

    if (visibleImages.length === 2) {
        return (
            <div className="mt-5 grid h-[240px] grid-cols-2 gap-2 overflow-hidden rounded-[20px]">
                {visibleImages.map((imageUrl, index) => (
                    <button
                        key={`${imageUrl}-${index}`}
                        type="button"
                        onClick={() => setPreviewIndex(index)}
                        aria-label={`${placeName} 여행 사진 ${index + 1} 크게 보기`}
                        className="min-h-0 overflow-hidden"
                    >
                        <img
                            src={resolveMediaUrl(imageUrl) ?? undefined}
                            alt={`${placeName} 여행 사진 ${index + 1}`}
                            className="h-full w-full object-cover transition duration-300 hover:scale-[1.025]"
                        />
                    </button>
                ))}
                <RecordPhotoPreview
                    imageUrls={imageUrls}
                    placeName={placeName}
                    previewIndex={previewIndex}
                    onPreviewIndexChange={setPreviewIndex}
                />
            </div>
        )
    }

    return (
        <div className="mt-5 grid h-[260px] grid-cols-[2fr_1fr] grid-rows-2 gap-2 overflow-hidden rounded-[20px]">
            <button
                type="button"
                onClick={() => setPreviewIndex(0)}
                aria-label={`${placeName} 여행 사진 1 크게 보기`}
                className="row-span-2 min-h-0 overflow-hidden"
            >
                <img
                    src={resolveMediaUrl(visibleImages[0]) ?? undefined}
                    alt={`${placeName} 여행 사진 1`}
                    className="h-full w-full object-cover transition duration-300 hover:scale-[1.025]"
                />
            </button>
            {visibleImages.slice(1).map((imageUrl, index) => {
                const showMore = index === 1 && remainingCount > 0
                return (
                    <button
                        key={`${imageUrl}-${index}`}
                        type="button"
                        onClick={() => setPreviewIndex(index + 1)}
                        aria-label={`${placeName} 여행 사진 ${index + 2} 크게 보기`}
                        className="relative min-h-0 overflow-hidden"
                    >
                        <img
                            src={resolveMediaUrl(imageUrl) ?? undefined}
                            alt={`${placeName} 여행 사진 ${index + 2}`}
                            className="h-full w-full object-cover transition duration-300 hover:scale-[1.025]"
                        />
                        {showMore && (
                            <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-xl font-black text-white">
                                +{remainingCount}
                            </span>
                        )}
                    </button>
                )
            })}
            <RecordPhotoPreview
                imageUrls={imageUrls}
                placeName={placeName}
                previewIndex={previewIndex}
                onPreviewIndexChange={setPreviewIndex}
            />
        </div>
    )
}

function RecordPhotoPreview({
    imageUrls,
    placeName,
    previewIndex,
    onPreviewIndexChange,
}: {
    imageUrls: string[]
    placeName: string
    previewIndex: number | null
    onPreviewIndexChange: (index: number | null) => void
}) {
    if (previewIndex === null || typeof document === 'undefined') return null

    const showPrevious = () =>
        onPreviewIndexChange(
            (previewIndex - 1 + imageUrls.length) % imageUrls.length,
        )
    const showNext = () =>
        onPreviewIndexChange((previewIndex + 1) % imageUrls.length)

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`${placeName} 여행 사진 미리보기`}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-sm"
            onClick={() => onPreviewIndexChange(null)}
        >
            <button
                type="button"
                onClick={() => onPreviewIndexChange(null)}
                aria-label="사진 미리보기 닫기"
                className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            >
                <XIcon size={24} />
            </button>

            {imageUrls.length > 1 && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation()
                        showPrevious()
                    }}
                    aria-label="이전 사진"
                    className="absolute left-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:left-8"
                >
                    <ChevronLeftIcon size={28} />
                </button>
            )}

            <img
                src={resolveMediaUrl(imageUrls[previewIndex]) ?? undefined}
                alt={`${placeName} 여행 사진 ${previewIndex + 1}`}
                className="max-h-[84vh] max-w-[86vw] rounded-2xl object-contain shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            />

            {imageUrls.length > 1 && (
                <>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation()
                            showNext()
                        }}
                        aria-label="다음 사진"
                        className="absolute right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:right-8"
                    >
                        <ChevronRightIcon size={28} />
                    </button>
                    <span className="absolute bottom-5 rounded-full bg-slate-950/55 px-3 py-1.5 text-sm font-bold text-white">
                        {previewIndex + 1} / {imageUrls.length}
                    </span>
                </>
            )}
        </div>,
        document.body,
    )
}

function PublicItineraryDays({
    days,
    focusedItemId,
    onFocusItem,
}: {
    days: PublicCardDetail['itinerary']
    focusedItemId: string | null
    onFocusItem: (itemId: string | null) => void
}) {
    return (
        <div className="space-y-8">
            {days.map((day) => (
                <section key={day.id}>
                    <div className="mt-5 flex items-end justify-between gap-4">
                        <div>
                            <p className="text-xs font-extrabold text-brand-700">
                                Day {day.dayNumber}
                            </p>
                            <h2 className="mt-1 text-xl font-black text-slate-900">
                                {day.title ?? `${day.itineraryDate} 일정`}
                            </h2>
                        </div>
                        <span className="text-xs font-bold text-slate-400">
                            {day.items.length}개 장소
                        </span>
                    </div>

                    {day.items.length === 0 ? (
                        <div className="mt-5 rounded-[22px] bg-slate-50 py-10 text-center text-sm text-slate-400">
                            이 날짜에 저장된 장소가 없습니다.
                        </div>
                    ) : (
                        <ol className="mt-6">
                            {day.items.map((item, index) => (
                                <li
                                    key={item.id}
                                    className="relative flex gap-4 pb-5 last:pb-0"
                                >
                                    <div className="relative flex w-9 shrink-0 justify-center">
                                        {index < day.items.length - 1 && (
                                            <span className="absolute left-1/2 top-8 h-[calc(100%+0.25rem)] -translate-x-1/2 border-l-2 border-dotted border-brand-200" />
                                        )}
                                        <span
                                            className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white text-xs font-black ${
                                                focusedItemId ===
                                                String(item.id)
                                                    ? 'border-brand text-brand'
                                                    : 'border-slate-300 text-slate-500'
                                            }`}
                                        >
                                            {index + 1}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onFocusItem(
                                                focusedItemId ===
                                                    String(item.id)
                                                    ? null
                                                    : String(item.id),
                                            )
                                        }
                                        className={`min-w-0 flex-1 rounded-[18px] border p-4 text-left transition ${
                                            focusedItemId === String(item.id)
                                                ? 'border-brand-200 bg-brand-50'
                                                : 'border-slate-100 bg-white hover:border-brand-100 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <b className="block truncate text-sm text-slate-900">
                                                    {item.placeName ??
                                                        '장소 미정'}
                                                </b>
                                                <span className="mt-1 block truncate text-xs text-slate-400">
                                                    {item.placeAddress ??
                                                        item.categoryName ??
                                                        '상세 정보 없음'}
                                                </span>
                                            </div>
                                            {item.startTime && (
                                                <time className="shrink-0 text-xs font-extrabold text-brand-700">
                                                    {item.startTime}
                                                </time>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            ))}
        </div>
    )
}

function formatPublicTripDates(
    startDate: string | null,
    endDate: string | null,
) {
    if (!startDate || !endDate) return '날짜 미정'
    return `${startDate.replaceAll('-', '.')} - ${endDate.replaceAll('-', '.')}`
}

function PageButton({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string
    disabled: boolean
    onClick: () => void
    children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="rounded-full border border-slate-200 bg-white p-2 disabled:opacity-30"
        >
            {children}
        </button>
    )
}
