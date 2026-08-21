import { useEffect, useState } from 'react'
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    LoaderCircleIcon,
    SearchIcon,
} from 'lucide-react'
import {
    fetchTripSharedBookmarks,
    addBookmark,
    removeBookmark,
    unshareBookmarkFromTrip,
    TravelCard,
    type TripSharedBookmark,
} from '@/features/explore-card'

const PAGE_SIZE = 6

export function BookmarkRoomPanel({
    tripId,
    onOpen,
}: {
    tripId: number
    onOpen: (cardId: number) => void
}) {
    const [items, setItems] = useState<TripSharedBookmark[]>([])
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(0)
    useEffect(() => {
        const controller = new AbortController()
        Promise.resolve().then(() => {
            if (!controller.signal.aborted) {
                setLoading(true)
                setError(null)
            }
        })
        fetchTripSharedBookmarks(tripId)
            .then((data) => {
                if (!controller.signal.aborted) {
                    setItems(data)
                    setPage(0)
                }
            })
            .catch((reason: unknown) => {
                if (!controller.signal.aborted)
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : '북마크를 불러오지 못했습니다.',
                    )
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false)
            })
        return () => controller.abort()
    }, [tripId])
    const filtered = items.filter(({ card }) => {
        const keyword = query.trim().toLowerCase()
        return (
            !keyword ||
            [card.title, card.destination, ...card.tags]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(keyword))
        )
    })
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const visiblePage = Math.min(page, Math.max(totalPages - 1, 0))
    const pageItems = filtered.slice(
        visiblePage * PAGE_SIZE,
        (visiblePage + 1) * PAGE_SIZE,
    )
    async function toggleBookmark(cardId: number) {
        const item = items.find(({ card }) => card.id === cardId)
        if (!item || item.card.ownCard) return
        if (item.card.bookmarked) {
            await removeBookmark(cardId)
            setItems(await fetchTripSharedBookmarks(tripId))
            return
        }
        await addBookmark(cardId)
        setItems((current) =>
            current.map((entry) =>
                entry.card.id === cardId
                    ? {
                          ...entry,
                          card: {
                              ...entry.card,
                              bookmarked: !entry.card.bookmarked,
                              bookmarkCount:
                                  entry.card.bookmarkCount +
                                  (entry.card.bookmarked ? -1 : 1),
                          },
                      }
                    : entry,
            ),
        )
    }
    async function unshare(cardId: number) {
        await unshareBookmarkFromTrip(tripId, cardId)
        setItems(await fetchTripSharedBookmarks(tripId))
    }
    return (
        <section className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-6">
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <p className="text-xs font-extrabold tracking-widest text-brand-700">
                        BOOKMARK
                    </p>
                    <h2 className="mt-1 text-2xl font-black">공유 북마크</h2>
                </div>
                <label className="flex w-64 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <SearchIcon size={15} className="text-slate-400" />
                    <input
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value)
                            setPage(0)
                        }}
                        placeholder="공유 북마크 검색"
                        className="min-w-0 flex-1 text-sm outline-none"
                    />
                </label>
            </div>
            {loading ? (
                <LoaderCircleIcon className="mx-auto mt-24 animate-spin text-brand" />
            ) : error ? (
                <p className="py-20 text-center text-sm text-red-500">
                    {error}
                </p>
            ) : filtered.length === 0 ? (
                <p className="rounded-3xl bg-white py-24 text-center text-sm text-slate-400">
                    공유된 북마크가 없습니다.
                </p>
            ) : (
                <div className="mx-auto w-full max-w-[1440px]">
                    <div className="grid grid-cols-1 items-start gap-x-6 gap-y-10 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {pageItems.map(
                            ({ card, sharerNicknames, sharedByMe }) => (
                                <div key={card.id} className="min-w-0">
                                    <TravelCard
                                        card={card}
                                        onBookmark={() =>
                                            void toggleBookmark(card.id)
                                        }
                                        onCopy={() => onOpen(card.id)}
                                        onOpen={() => onOpen(card.id)}
                                        showCopyAction={false}
                                        flat
                                    />
                                    <div className="mt-2 flex items-center justify-between gap-2 px-2">
                                        <p className="min-w-0 truncate text-xs font-semibold text-slate-500">
                                            {sharerNicknames.join(', ')}{' '}
                                            유저님이 공유했습니다
                                        </p>
                                        {sharedByMe && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void unshare(card.id)
                                                }
                                                className="shrink-0 text-xs font-bold text-slate-400 hover:text-red-500"
                                            >
                                                공유 해제
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ),
                        )}
                    </div>
                    {totalPages > 1 && (
                        <nav
                            aria-label="공유 북마크 페이지"
                            className="mt-6 flex flex-wrap justify-center gap-2"
                        >
                            <button
                                type="button"
                                aria-label="이전 페이지"
                                disabled={visiblePage === 0}
                                onClick={() =>
                                    setPage((current) => current - 1)
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 disabled:opacity-30"
                            >
                                <ChevronLeftIcon size={16} />
                            </button>
                            {Array.from({ length: totalPages }, (_, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => setPage(index)}
                                    aria-current={
                                        visiblePage === index
                                            ? 'page'
                                            : undefined
                                    }
                                    className={`h-9 w-9 rounded-full text-xs font-bold ${visiblePage === index ? 'bg-brand text-white' : 'bg-white text-slate-600'}`}
                                >
                                    {index + 1}
                                </button>
                            ))}
                            <button
                                type="button"
                                aria-label="다음 페이지"
                                disabled={visiblePage + 1 >= totalPages}
                                onClick={() =>
                                    setPage((current) => current + 1)
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 disabled:opacity-30"
                            >
                                <ChevronRightIcon size={16} />
                            </button>
                        </nav>
                    )}
                </div>
            )}
        </section>
    )
}
