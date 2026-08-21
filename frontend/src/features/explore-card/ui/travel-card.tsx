import { BookmarkIcon, CalendarPlusIcon, MapPinIcon } from 'lucide-react'
import { resolveMediaUrl } from '@/shared/api/client'
import type { PublicCard } from '../api/card-api'

const DEFAULT_COVER_IMAGE = '/ec246eb2-6c56-4a2e-aa65-d09ffc9a62c9.jpg'

const TRAVEL_STYLE_LABELS: Record<string, string> = {
    HEALING: '힐링',
    ACTIVITY: '액티비티',
    FOOD: '맛집',
    CULTURE: '문화',
    SHOPPING: '쇼핑',
    NATURE: '자연',
    CITY: '도시',
    SNS_HOT_PLACE: 'SNS 핫플',
}

export function TravelCard({
    card,
    onBookmark,
    onCopy,
    onOpen,
    onShare,
    showCopyAction = true,
    flat = false,
}: {
    card: PublicCard
    onBookmark: () => void
    onCopy: () => void
    onOpen: () => void
    onShare?: () => void
    showCopyAction?: boolean
    flat?: boolean
}) {
    const isActionTarget = (target: EventTarget | null) =>
        target instanceof HTMLElement &&
        target.closest('button, a, input, select, textarea') !== null

    return (
        <article
            role="button"
            tabIndex={0}
            onClick={(event) => {
                if (!isActionTarget(event.target)) onOpen()
            }}
            onKeyDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    (event.key === 'Enter' || event.key === ' ')
                ) {
                    event.preventDefault()
                    onOpen()
                }
            }}
            className={`relative flex aspect-[4/3] min-w-0 cursor-pointer flex-col border-0 shadow-none outline-none ring-0 transition hover:-translate-y-0.5 focus:outline-none focus-visible:outline-none ${flat ? 'w-full' : 'h-full'}`}
        >
            <img
                src={resolveMediaUrl(card.coverImageUrl) ?? DEFAULT_COVER_IMAGE}
                onError={(event) => {
                    event.currentTarget.src = DEFAULT_COVER_IMAGE
                }}
                alt=""
                className="absolute inset-0 h-full w-full rounded-[24px] object-cover"
            />
            <div className="absolute -inset-x-px -bottom-px z-10 flex h-[177px] flex-col justify-end gap-2 rounded-b-[24px] bg-gradient-to-t from-white via-white/85 to-white/0 px-[17px] pb-[17px] pt-16 text-slate-900">
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-black tracking-[-0.03em]">
                        {card.title}
                    </h2>
                    <p className="mt-1 flex min-w-0 items-center gap-1 text-xs font-medium text-slate-500">
                        <MapPinIcon size={13} className="shrink-0 text-brand" />
                        <span className="truncate">
                            {card.destination ?? '여행지 미정'}
                        </span>
                    </p>
                </div>
                <div className="flex min-h-7 items-center gap-1.5 overflow-hidden">
                    {[...card.travelStyles, ...card.tags].map((tag) => (
                        <span
                            key={tag}
                            className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold leading-none text-brand-700"
                        >
                            #{TRAVEL_STYLE_LABELS[tag] ?? tag}
                        </span>
                    ))}
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2 pt-1 text-[11px]">
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation()
                            onBookmark()
                        }}
                        className="flex min-w-0 items-center gap-1 font-extrabold text-brand-700"
                    >
                        <BookmarkIcon
                            size={15}
                            className="shrink-0"
                            fill={card.bookmarked ? 'currentColor' : 'none'}
                        />
                        <span className="truncate">
                            PICK {card.bookmarkCount}
                        </span>
                    </button>
                    <div className="flex shrink-0 gap-1">
                        {onShare && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onShare()
                                }}
                                className="whitespace-nowrap rounded-full border border-brand-100 bg-white px-2.5 py-2 font-extrabold text-brand-700"
                            >
                                공유
                            </button>
                        )}
                        {showCopyAction && (
                            <button
                                type="button"
                                aria-label="일정에 담기"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onCopy()
                                }}
                                className="flex items-center gap-1 whitespace-nowrap rounded-full bg-brand px-2.5 py-2 font-extrabold text-white"
                            >
                                <CalendarPlusIcon size={14} />
                                <span className="hidden sm:inline">
                                    일정 담기
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    )
}
