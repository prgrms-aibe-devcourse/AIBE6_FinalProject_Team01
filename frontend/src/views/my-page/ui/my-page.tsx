import React, { useEffect, useRef, useState } from 'react'
import {
    PencilIcon,
    AlertTriangleIcon,
    CameraIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    PaletteIcon,
    SearchIcon,
    XIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, DEFAULT_AVATAR_COLOR, ThemePicker } from '@/shared/ui'
import { useCurrentUserStore } from '@/shared/model'
import { useAppTheme } from '@/shared/lib'
import { resolveMediaUrl } from '@/shared/api/client'
import {
    checkNicknameAvailability,
    useProfileStore,
    withdrawAccount,
} from '@/features/manage-profile'
import { useTripStore } from '@/features/manage-trip'
import {
    fetchBookmarkedCards,
    fetchTripSharedBookmarks,
    ItineraryCopyFlow,
    removeBookmark,
    shareBookmarkToTrip,
    unshareBookmarkFromTrip,
    type PublicCard,
    TravelCard,
} from '@/features/explore-card'

const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_PROFILE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const PROVIDER_LABEL: Record<string, string> = {
    GOOGLE: 'Google',
    KAKAO: '카카오',
    NAVER: '네이버',
    APPLE: 'Apple',
}

const WITHDRAWAL_REASON_HELP: Record<string, string> = {
    recreate:
        '개인정보 보관기간이 끝난 후 같은 이메일 또는 소셜 계정으로 다시 가입할 수 있어요.',
    difficult:
        '여행방과 일정 기능을 더 쉽게 사용할 수 있도록 계속 개선하고 있어요.',
    missing: '필요한 기능에 대한 의견은 서비스 개선에 큰 도움이 됩니다.',
    notifications: '알림이 불편했다면 여행방별 알림 설정을 조정할 수 있어요.',
    privacy:
        '탈퇴 후 작성 기록에는 개인정보 대신 ‘탈퇴한 사용자’가 표시됩니다.',
    other: '그동안 서비스를 이용해 주셔서 감사합니다.',
}

export function MyPage() {
    const navigate = useNavigate()
    const currentUser = useCurrentUserStore((state) => state.currentUser)
    const currentUserId = currentUser?.id ?? null
    const { theme, setTheme, colorMode, setColorMode } = useAppTheme()
    const {
        changeNickname,
        changeProfileImage,
        isUpdatingNickname,
        isUploadingImage,
    } = useProfileStore()
    const { trips, isLoading, error: tripError, loadTrips } = useTripStore()
    const me = {
        name: currentUser?.nickname ?? '게스트',
        avatarColor: DEFAULT_AVATAR_COLOR,
        imageUrl: resolveMediaUrl(currentUser?.profileImageUrl),
    }
    const loginProviderLabel = currentUser
        ? PROVIDER_LABEL[currentUser.provider]
        : '로그인 필요'
    const [draft, setDraft] = useState(me.name)
    const [editing, setEditing] = useState(false)
    const [error, setError] = useState('')
    const [checkedNickname, setCheckedNickname] = useState('')
    const [isCheckingNickname, setIsCheckingNickname] = useState(false)
    const [imageError, setImageError] = useState('')
    const [isThemeModalOpen, setIsThemeModalOpen] = useState(false)
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false)
    const [isWithdrawing, setIsWithdrawing] = useState(false)
    const [withdrawError, setWithdrawError] = useState('')
    const [withdrawReason, setWithdrawReason] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const bookmarkRailRef = useRef<HTMLDivElement>(null)
    const [bookmarks, setBookmarks] = useState<PublicCard[]>([])
    const [bookmarkQuery, setBookmarkQuery] = useState('')
    const [bookmarksLoading, setBookmarksLoading] = useState(true)
    const [shareCard, setShareCard] = useState<PublicCard | null>(null)
    const [copyCard, setCopyCard] = useState<PublicCard | null>(null)
    const [sharingTripId, setSharingTripId] = useState<number | null>(null)
    const [sharedTripIds, setSharedTripIds] = useState<Set<number>>(new Set())
    const [shareStatusLoading, setShareStatusLoading] = useState(false)
    const [shareError, setShareError] = useState('')
    const [canScrollBookmarksLeft, setCanScrollBookmarksLeft] = useState(false)
    const [canScrollBookmarksRight, setCanScrollBookmarksRight] =
        useState(false)

    useEffect(() => {
        if (currentUserId == null) return
        void loadTrips(currentUserId)
        void fetchBookmarkedCards()
            .then(setBookmarks)
            .finally(() => setBookmarksLoading(false))
    }, [currentUserId, loadTrips])

    useEffect(() => {
        if (!shareCard || trips.length === 0) return

        let cancelled = false
        void Promise.all(
            trips.map(async (trip) => {
                const shared = await fetchTripSharedBookmarks(trip.id)
                return shared.some(
                    (item) => item.card.id === shareCard.id && item.sharedByMe,
                )
                    ? trip.id
                    : null
            }),
        )
            .then((tripIds) => {
                if (!cancelled) {
                    setSharedTripIds(
                        new Set(
                            tripIds.filter((id): id is number => id != null),
                        ),
                    )
                }
            })
            .catch(() => {
                if (!cancelled) setShareError('공유 상태를 확인하지 못했어요.')
            })
            .finally(() => {
                if (!cancelled) setShareStatusLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [shareCard, trips])

    const filteredBookmarks = bookmarks.filter((card) => {
        const query = bookmarkQuery.trim().toLowerCase()
        return (
            !query ||
            [card.title, card.destination, ...card.tags]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(query))
        )
    })

    function updateBookmarkScrollButtons() {
        const rail = bookmarkRailRef.current
        if (!rail) return
        const maxScrollLeft = rail.scrollWidth - rail.clientWidth
        setCanScrollBookmarksLeft(rail.scrollLeft > 1)
        setCanScrollBookmarksRight(rail.scrollLeft < maxScrollLeft - 1)
    }

    useEffect(() => {
        const rail = bookmarkRailRef.current
        if (!rail) return
        const handleWheel = (event: WheelEvent) => {
            if (rail.scrollWidth <= rail.clientWidth) return
            const movement =
                Math.abs(event.deltaX) > Math.abs(event.deltaY)
                    ? event.deltaX
                    : event.deltaY
            const atStart = movement < 0 && rail.scrollLeft <= 0
            const atEnd =
                movement > 0 &&
                rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1
            if (atStart || atEnd) return
            event.preventDefault()
            rail.scrollBy({ left: movement, behavior: 'auto' })
        }
        const observer = new ResizeObserver(updateBookmarkScrollButtons)
        observer.observe(rail)
        rail.addEventListener('wheel', handleWheel, { passive: false })
        requestAnimationFrame(updateBookmarkScrollButtons)
        return () => {
            observer.disconnect()
            rail.removeEventListener('wheel', handleWheel)
        }
    }, [filteredBookmarks.length])

    async function shareToTrip(tripId: number) {
        if (!shareCard || sharingTripId != null) return
        setSharingTripId(tripId)
        setShareError('')
        try {
            if (sharedTripIds.has(tripId)) {
                await unshareBookmarkFromTrip(tripId, shareCard.id)
                setSharedTripIds((current) => {
                    const next = new Set(current)
                    next.delete(tripId)
                    return next
                })
            } else {
                await shareBookmarkToTrip(tripId, shareCard.id)
                setSharedTripIds((current) => new Set(current).add(tripId))
            }
        } catch (err) {
            setShareError(
                err instanceof Error
                    ? err.message
                    : '북마크 공유에 실패했어요.',
            )
        } finally {
            setSharingTripId(null)
        }
    }

    function openShareModal(card: PublicCard) {
        setSharedTripIds(new Set())
        setShareError('')
        setShareStatusLoading(trips.length > 0)
        setShareCard(card)
    }

    async function removeSavedBookmark(cardId: number) {
        await removeBookmark(cardId)
        setBookmarks((current) => current.filter((card) => card.id !== cardId))
    }

    async function saveNickname() {
        const v = draft.trim()
        if (v.length < 2 || v.length > 12) {
            setError('닉네임은 2~12자로 입력해주세요')
            return
        }
        if (!/^[가-힣a-zA-Z0-9_]+$/.test(v)) {
            setError('한글, 영문, 숫자, _만 사용할 수 있어요')
            return
        }
        if (checkedNickname !== v) {
            setError('닉네임 중복 확인을 완료해 주세요')
            return
        }
        try {
            await changeNickname(v)
            setError('')
            setEditing(false)
        } catch (err) {
            setError(
                err instanceof Error ? err.message : '닉네임 변경에 실패했어요',
            )
        }
    }

    async function checkNickname() {
        const v = draft.trim()
        if (v.length < 2 || v.length > 12) {
            setError('닉네임은 2~12자로 입력해주세요')
            return
        }
        if (!/^[가-힣a-zA-Z0-9_]+$/.test(v)) {
            setError('한글, 영문, 숫자, _만 사용할 수 있어요')
            return
        }

        setIsCheckingNickname(true)
        try {
            const available = await checkNicknameAvailability(v)
            if (!available) {
                setCheckedNickname('')
                setError('이미 사용 중인 닉네임입니다')
                return
            }
            setCheckedNickname(v)
            setError('')
        } catch (err) {
            setCheckedNickname('')
            setError(
                err instanceof Error
                    ? err.message
                    : '닉네임 중복 확인에 실패했어요',
            )
        } finally {
            setIsCheckingNickname(false)
        }
    }

    async function handleProfileImageSelect(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return

        if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.type)) {
            setImageError('jpg, png, webp 이미지만 업로드할 수 있어요')
            return
        }
        if (file.size > MAX_PROFILE_IMAGE_SIZE) {
            setImageError('이미지 파일은 5MB 이하만 업로드할 수 있어요')
            return
        }

        try {
            await changeProfileImage(file)
            setImageError('')
        } catch (err) {
            setImageError(
                err instanceof Error
                    ? err.message
                    : '프로필 이미지 등록에 실패했어요',
            )
        }
    }

    async function handleWithdraw() {
        setIsWithdrawing(true)
        setWithdrawError('')
        try {
            await withdrawAccount()
            navigate('/login', { replace: true })
        } catch (err) {
            setWithdrawError(
                err instanceof Error ? err.message : '회원 탈퇴에 실패했어요',
            )
        } finally {
            setIsWithdrawing(false)
        }
    }

    function openWithdrawModal() {
        setWithdrawReason('')
        setWithdrawError('')
        setIsWithdrawModalOpen(true)
    }

    function closeWithdrawModal() {
        if (isWithdrawing) return
        setIsWithdrawModalOpen(false)
    }

    return (
        <div className="min-h-full bg-[var(--color-app-background)] px-5 py-7 sm:px-9">
            <div className="mx-auto max-w-3xl">
                <p className="text-xs font-extrabold tracking-[0.12em] text-brand-700">
                    ACCOUNT
                </p>
                <h1 className="mb-8 mt-1 text-3xl font-extrabold tracking-[-0.05em] text-slate-950">
                    마이페이지
                </h1>

                {/* Profile */}
                <section className="mb-8 rounded-[22px] border border-slate-100 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                            <Avatar
                                name={me.name}
                                color={me.avatarColor}
                                imageUrl={me.imageUrl}
                                size={64}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingImage}
                                aria-label="프로필 이미지 변경"
                                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
                            >
                                <CameraIcon size={12} />
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={handleProfileImageSelect}
                            />
                        </div>
                        <div className="flex-1">
                            {editing ? (
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            autoFocus
                                            value={draft}
                                            onChange={(e) => {
                                                setDraft(e.target.value)
                                                setCheckedNickname('')
                                                setError('')
                                            }}
                                            className={`w-48 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                                                error
                                                    ? 'border-red-400 focus:ring-red-100'
                                                    : 'border-slate-300 focus:ring-brand-100'
                                            }`}
                                        />

                                        <button
                                            type="button"
                                            onClick={() => void checkNickname()}
                                            disabled={
                                                isCheckingNickname ||
                                                !draft.trim()
                                            }
                                            className="whitespace-nowrap rounded-xl border border-brand px-3 py-2 text-sm font-semibold text-brand transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isCheckingNickname
                                                ? '확인 중'
                                                : '중복 확인'}
                                        </button>

                                        <button
                                            onClick={() => void saveNickname()}
                                            disabled={isUpdatingNickname}
                                            className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            저장
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditing(false)
                                                setDraft(me.name)
                                                setCheckedNickname('')
                                                setError('')
                                            }}
                                            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
                                        >
                                            취소
                                        </button>
                                    </div>
                                    {error && (
                                        <p className="mt-1.5 text-xs font-medium text-red-500">
                                            {error}
                                        </p>
                                    )}
                                    {!error &&
                                        checkedNickname === draft.trim() && (
                                            <p className="mt-1.5 text-xs font-medium text-emerald-600">
                                                사용 가능한 닉네임입니다.
                                            </p>
                                        )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold">
                                        {me.name}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setDraft(me.name)
                                            setCheckedNickname('')
                                            setError('')
                                            setEditing(true)
                                        }}
                                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                                    >
                                        <PencilIcon size={13} /> 닉네임 변경
                                    </button>
                                </div>
                            )}
                            {imageError && (
                                <p className="mt-1 text-xs font-medium text-red-500">
                                    {imageError}
                                </p>
                            )}
                            <p className="mt-0.5 text-sm text-slate-500">
                                {loginProviderLabel} 계정으로 로그인됨
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mb-8 rounded-[22px] border border-slate-100 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-brand-50)] text-[var(--color-brand)]">
                                <PaletteIcon size={20} />
                            </span>
                            <div className="min-w-0">
                                <h2 className="font-bold text-[var(--color-app-ink)]">
                                    테마 설정
                                </h2>
                                <p className="mt-0.5 text-sm text-[var(--color-app-text-secondary)]">
                                    화면 모드와 포인트 색상을 변경할 수 있어요.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsThemeModalOpen(true)}
                            className="shrink-0 rounded-xl border border-[var(--color-app-border)] px-4 py-2.5 text-sm font-bold text-[var(--color-app-text)] transition hover:border-[var(--color-brand-200)] hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)]"
                        >
                            변경
                        </button>
                    </div>
                </section>

                {/* Bookmarks */}
                <section className="mb-8">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className="text-lg font-bold">여행자 PICK</h2>
                        <label className="flex w-56 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <SearchIcon size={14} className="text-slate-400" />
                            <input
                                value={bookmarkQuery}
                                onChange={(event) =>
                                    setBookmarkQuery(event.target.value)
                                }
                                placeholder="북마크 검색"
                                className="min-w-0 flex-1 text-xs outline-none"
                            />
                        </label>
                    </div>
                    <div className="relative">
                        <div
                            ref={bookmarkRailRef}
                            onScroll={updateBookmarkScrollButtons}
                            className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2"
                        >
                            {filteredBookmarks.map((card) => (
                                <div
                                    key={card.id}
                                    className="w-[calc((100%-2rem)/3)] min-w-0 shrink-0 snap-start"
                                >
                                    <TravelCard
                                        card={card}
                                        onBookmark={() =>
                                            void removeSavedBookmark(card.id)
                                        }
                                        onCopy={() => setCopyCard(card)}
                                        onOpen={() =>
                                            navigate(`/app/explore/${card.id}`)
                                        }
                                        onShare={() => openShareModal(card)}
                                        flat
                                    />
                                </div>
                            ))}
                            {!bookmarksLoading &&
                                filteredBookmarks.length === 0 && (
                                    <p className="w-full rounded-[22px] border border-slate-100 bg-white py-16 text-center text-sm text-slate-400">
                                        저장한 북마크가 없습니다.
                                    </p>
                                )}
                        </div>
                        {(canScrollBookmarksLeft ||
                            canScrollBookmarksRight) && (
                            <>
                                {canScrollBookmarksLeft && (
                                    <button
                                        type="button"
                                        aria-label="이전 북마크"
                                        onClick={() =>
                                            bookmarkRailRef.current?.scrollBy({
                                                left: -bookmarkRailRef.current
                                                    .clientWidth,
                                                behavior: 'smooth',
                                            })
                                        }
                                        className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white p-2 shadow-md"
                                    >
                                        <ChevronLeftIcon size={18} />
                                    </button>
                                )}
                                {canScrollBookmarksRight && (
                                    <button
                                        type="button"
                                        aria-label="다음 북마크"
                                        onClick={() =>
                                            bookmarkRailRef.current?.scrollBy({
                                                left: bookmarkRailRef.current
                                                    .clientWidth,
                                                behavior: 'smooth',
                                            })
                                        }
                                        className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white p-2 shadow-md"
                                    >
                                        <ChevronRightIcon size={18} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </section>

                {copyCard && (
                    <ItineraryCopyFlow
                        card={copyCard}
                        onClose={() => setCopyCard(null)}
                    />
                )}

                {shareCard && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
                        onMouseDown={(event) =>
                            event.target === event.currentTarget &&
                            setShareCard(null)
                        }
                    >
                        <section className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
                            <div className="flex justify-between gap-4">
                                <div className="min-w-0">
                                    <h2 className="font-extrabold">
                                        여행방에 공유
                                    </h2>
                                    <p className="mt-1 truncate text-xs text-slate-500">
                                        {shareCard.title}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label="공유 창 닫기"
                                    onClick={() => setShareCard(null)}
                                >
                                    <XIcon size={18} />
                                </button>
                            </div>
                            <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                                이미 공유한 여행방은 ‘공유 해제’를 눌러 취소할
                                수 있어요.
                            </p>
                            {shareError && (
                                <p className="mt-2 text-xs font-semibold text-red-500">
                                    {shareError}
                                </p>
                            )}
                            <div className="mt-4 space-y-2">
                                {isLoading || shareStatusLoading ? (
                                    <p className="py-6 text-center text-sm text-slate-400">
                                        공유 상태를 확인하는 중...
                                    </p>
                                ) : tripError ? (
                                    <p className="text-sm text-red-500">
                                        {tripError}
                                    </p>
                                ) : trips.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-slate-400">
                                        참여 중인 여행방이 없습니다.
                                    </p>
                                ) : (
                                    trips.map((trip) => {
                                        const alreadyShared = sharedTripIds.has(
                                            trip.id,
                                        )
                                        return (
                                            <button
                                                key={trip.id}
                                                type="button"
                                                disabled={sharingTripId != null}
                                                onClick={() =>
                                                    void shareToTrip(trip.id)
                                                }
                                                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${alreadyShared ? 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-red-100 hover:bg-red-50 hover:text-red-600' : 'border-slate-100 hover:bg-brand-50'} disabled:cursor-wait disabled:opacity-60`}
                                            >
                                                <span className="truncate">
                                                    {trip.title}
                                                </span>
                                                <span className="shrink-0 text-xs">
                                                    {sharingTripId === trip.id
                                                        ? alreadyShared
                                                            ? '해제 중...'
                                                            : '공유 중...'
                                                        : alreadyShared
                                                          ? '공유 해제'
                                                          : '공유하기'}
                                                </span>
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {/* Danger zone */}
                <section className="rounded-[22px] border border-red-100 bg-red-50/50 p-6">
                    <div className="flex items-start gap-3">
                        <AlertTriangleIcon
                            size={20}
                            className="mt-0.5 text-red-500"
                        />
                        <div>
                            <h2 className="font-bold text-red-700">
                                회원 탈퇴
                            </h2>
                            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-red-600/80">
                                <li>
                                    개인정보는 개인정보처리방침에 따라
                                    보관·파기됩니다.
                                </li>
                                <li>
                                    탈퇴 후 90일간 동일 계정으로 재가입할 수
                                    없습니다.
                                </li>
                                <li>
                                    익명화된 개인정보는 다시 복구할 수 없습니다.
                                </li>
                                <li>
                                    공동 여행방에 공유한 기록은 삭제되지 않고
                                    작성자만 ‘탈퇴한 사용자’로 표시됩니다.
                                </li>
                            </ol>
                            <button
                                type="button"
                                onClick={openWithdrawModal}
                                className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                            >
                                탈퇴하기
                            </button>
                        </div>
                    </div>
                </section>
            </div>
            {isThemeModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-5 py-8"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="theme-modal-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setIsThemeModalOpen(false)
                        }
                    }}
                >
                    <div className="relative w-full max-w-[600px] rounded-[28px] bg-[var(--color-app-surface)] px-7 py-8 shadow-2xl sm:px-9">
                        <button
                            type="button"
                            onClick={() => setIsThemeModalOpen(false)}
                            aria-label="테마 설정 팝업 닫기"
                            className="absolute right-5 top-5 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                            <XIcon size={20} />
                        </button>
                        <h2
                            id="theme-modal-title"
                            className="pr-10 text-xl font-extrabold text-[var(--color-app-ink)]"
                        >
                            테마 설정
                        </h2>
                        <div className="mt-6">
                            <ThemePicker
                                value={theme}
                                onChange={setTheme}
                                colorMode={colorMode}
                                onColorModeChange={setColorMode}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsThemeModalOpen(false)}
                            className="mt-8 w-full rounded-xl bg-[var(--color-brand)] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[var(--color-brand-700)]"
                        >
                            적용 완료
                        </button>
                    </div>
                </div>
            )}
            {isWithdrawModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-5 py-8"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="withdraw-title"
                >
                    <div className="relative w-full max-w-[520px] rounded-[28px] bg-white px-7 py-8 shadow-2xl sm:px-9">
                        <button
                            type="button"
                            onClick={closeWithdrawModal}
                            disabled={isWithdrawing}
                            aria-label="회원 탈퇴 팝업 닫기"
                            className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                        >
                            <XIcon size={20} />
                        </button>
                        <h2
                            id="withdraw-title"
                            className="pr-8 text-xl font-extrabold leading-7 text-slate-950"
                        >
                            {me.name}님과 이별인가요?
                            <br />
                            너무 아쉬워요
                        </h2>
                        <div className="mt-5 rounded-2xl bg-slate-50 px-5 py-4">
                            <h3 className="text-sm font-extrabold text-slate-900">
                                회원탈퇴 안내
                            </h3>
                            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
                                <li>
                                    개인정보는 개인정보처리방침에 따라
                                    보관·파기됩니다.
                                </li>
                                <li>
                                    탈퇴 후 90일간 동일 이메일 또는 소셜
                                    계정으로 재가입할 수 없습니다.
                                </li>
                                <li>
                                    익명화된 개인정보는 다시 복구할 수 없습니다.
                                </li>
                                <li>
                                    공동 여행방에 공유한 여행·일정·댓글 등의
                                    기록은 삭제되지 않고 작성자만 ‘탈퇴한
                                    사용자’로 표시됩니다.
                                </li>
                            </ol>
                        </div>

                        <label
                            htmlFor="withdraw-reason"
                            className="mt-7 block text-sm font-extrabold text-slate-900"
                        >
                            {me.name}님이 탈퇴하려는 이유가 궁금해요.
                        </label>
                        <select
                            id="withdraw-reason"
                            value={withdrawReason}
                            onChange={(event) =>
                                setWithdrawReason(event.target.value)
                            }
                            disabled={isWithdrawing}
                            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:bg-slate-50"
                        >
                            <option value="">탈퇴 사유를 선택해 주세요</option>
                            <option value="recreate">
                                새 계정을 만들고 싶어요
                            </option>
                            <option value="difficult">
                                서비스 이용이 어려워요
                            </option>
                            <option value="missing">
                                원하는 기능이 없어요
                            </option>
                            <option value="notifications">
                                알림이 너무 많아요
                            </option>
                            <option value="privacy">개인정보가 걱정돼요</option>
                            <option value="other">기타</option>
                        </select>

                        <div className="mt-4 min-h-20 rounded-xl bg-slate-50 px-4 py-3">
                            {withdrawReason ? (
                                <p className="text-sm leading-6 text-slate-600">
                                    {WITHDRAWAL_REASON_HELP[withdrawReason]}
                                </p>
                            ) : (
                                <p className="text-sm leading-6 text-slate-400">
                                    사유를 선택하면 탈퇴 전 확인할 내용을
                                    안내해드릴게요.
                                </p>
                            )}
                        </div>

                        {withdrawError && (
                            <p className="mt-3 text-sm text-red-600">
                                {withdrawError}
                            </p>
                        )}
                        <div className="mt-8 flex gap-3">
                            <button
                                type="button"
                                onClick={closeWithdrawModal}
                                disabled={isWithdrawing}
                                className="flex-1 rounded-xl bg-slate-100 px-4 py-3.5 text-sm font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleWithdraw()}
                                disabled={isWithdrawing || !withdrawReason}
                                className="flex-1 rounded-xl bg-red-500 px-4 py-3.5 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-200"
                            >
                                {isWithdrawing ? '탈퇴 중...' : '제출'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
