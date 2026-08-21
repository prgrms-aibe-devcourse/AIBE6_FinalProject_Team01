import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
    ChevronRightIcon,
    CalendarDaysIcon,
    HistoryIcon,
    ListIcon,
    MapIcon,
    VoteIcon,
    PanelLeftCloseIcon,
    PanelLeftOpenIcon,
} from 'lucide-react'
import {
    Place,
    Room,
    addTripPlace,
    deleteTripPlace,
    fromApiToPlace,
    getPlaceComments,
    addPlaceComment,
    deletePlaceComment,
    getPlaceCategories,
    updateTripPlaceCategory,
    type PlaceCategoryInfo,
    type ItineraryDay,
    PlaceCommentResponse,
} from '@/entities/trip'
import { CommentSheet, useCommentStore } from '@/features/comment-place'
import { InviteModal } from '@/features/invite-member'
import { useTripMembers } from '@/features/manage-trip'
import { PlaceSearch } from '@/features/search-place'
import type {
    AiPlaceSearchRecommendation,
    PlaceSearchResult,
} from '@/features/search-place'
import { getApiErrorMessage } from '@/shared/api/client'
import { globalModal, useCurrentUserStore } from '@/shared/model'
import { resolveMemberNickname } from '../lib/member-lookup'
import { UNSAVED_DATE_MODAL_COPY } from '../lib/unsaved-date-modal-copy'
import { upsertPlaceComment } from '../lib/place-comments'
import { ActivityLogPanel } from './activity-log'
import { useActivityLogStore } from '@/features/view-activity-log'
import { useNotificationStore } from '@/features/manage-notification'
import {
    type ActiveTripAwareness,
    useTripAwarenessStore,
} from '@/features/trip-awareness'
import { DateVotePanel } from './date-vote-panel'
import { SchedulePanel } from './schedule-panel'
import { PlaceCard } from './place-card'
import { PlaceVotePanel } from './place-vote-panel'
import { PlaceDetailOverlay } from './place-detail-overlay'
import { RoomHeader } from './room-header'

function mapApiComment(comment: PlaceCommentResponse) {
    return {
        id: String(comment.id),
        memberId: String(comment.memberId),
        text: comment.content,
        createdAt: comment.createdAt,
    }
}

export type TripRoomMode = 'plan' | 'record' | 'bookmark'

function median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle]
}

function resolvePlaceSearchCenter(room: Room, places: Place[]) {
    const destinationLat = room.destinationLat
    const destinationLng = room.destinationLng
    if (
        destinationLat != null &&
        destinationLng != null &&
        Number.isFinite(destinationLat) &&
        Number.isFinite(destinationLng)
    ) {
        return {
            latitude: destinationLat,
            longitude: destinationLng,
        }
    }

    const savedPlaces = places.filter(
        (place) =>
            place.status === 'saved' &&
            Number.isFinite(place.lat) &&
            Number.isFinite(place.lng),
    )
    const centerCandidates =
        savedPlaces.length > 0
            ? savedPlaces
            : places.filter(
                  (place) =>
                      Number.isFinite(place.lat) && Number.isFinite(place.lng),
              )
    if (centerCandidates.length === 0) {
        return { latitude: undefined, longitude: undefined }
    }

    return {
        latitude: median(centerCandidates.map((place) => place.lat)),
        longitude: median(centerCandidates.map((place) => place.lng)),
    }
}
type PlanTab = 'places' | 'votes' | 'itinerary' | 'schedule'
export type TripRoomWorkspace = PlanTab

type Props = {
    room: Room
    places: Place[]
    selectedId: string | null
    onSelectPlace: (id: string) => void
    onFocusSearchResult?: (result: PlaceSearchResult) => void
    onDeselectPlace?: () => void
    onBack: () => void
    onManage: () => void
    onVisibilityManage: () => void
    onUpdatePlace: (id: string, update: (place: Place) => Place) => void
    onAddPlace: (place: Place) => void
    onDeletePlace: (id: string) => void
    loadError?: string | null
    canManage: boolean
    tripId: number
    initialActivityOpen?: boolean
    onTripDatesChanged?: () => void | Promise<void>
    onItineraryDaysLoaded?: (days: ItineraryDay[]) => void
    itineraryVersion?: number
    realtimeVersion?: number
    showBackButton?: boolean
    guestView?: boolean
    onJoin?: () => void
    activeWorkspace: TripRoomWorkspace
    onWorkspaceChange: (workspace: TripRoomWorkspace) => void
    onFollowMember?: (awareness: ActiveTripAwareness) => void
    headerContainer?: HTMLElement | null
    aiPlaceRecommendations?: AiPlaceSearchRecommendation[] | null
    mapCollapsed?: boolean
    onToggleMap?: () => void
    hoveredPlaceId?: string | null
    onHoverPlace?: (placeId: string | null) => void
    focusDayRequest?: { dayNumber: number; version: number } | null
    onPlacePhotoResolved?: (
        placeId: string,
        photoUrl: string,
        attribution: string | null,
        attributionUrl: string | null,
        sourceUrl: string,
    ) => void
}

export function RoomDetailPanel({
    room,
    places,
    selectedId,
    onSelectPlace,
    onFocusSearchResult,
    onDeselectPlace,
    onBack,
    onManage,
    onVisibilityManage,
    onUpdatePlace,
    onAddPlace,
    onDeletePlace,
    loadError,
    canManage,
    tripId,
    initialActivityOpen = false,
    onTripDatesChanged,
    onItineraryDaysLoaded,
    itineraryVersion = 0,
    realtimeVersion = 0,
    showBackButton = true,
    guestView = false,
    onJoin,
    activeWorkspace: planTab,
    onWorkspaceChange: setPlanTab,
    onFollowMember,
    headerContainer,
    aiPlaceRecommendations,
    mapCollapsed = false,
    onToggleMap,
    hoveredPlaceId = null,
    onHoverPlace,
    focusDayRequest = null,
    onPlacePhotoResolved,
}: Props) {
    const navigate = useNavigate()
    const [activityOpen, setActivityOpen] = useState(initialActivityOpen)
    const [commentPlaceId, setCommentPlaceId] = useState<string | null>(null)
    const commentMutationVersionRef = useRef(0)
    const [commentError, setCommentError] = useState<string | null>(null)
    const [inviteOpen, setInviteOpen] = useState(false)
    const { members } = useTripMembers(tripId)
    const currentMemberId = useCurrentUserStore(
        (state) => state.currentUser?.id ?? null,
    )
    const awarenessByMemberId = useTripAwarenessStore(
        (state) => state.awarenessByMemberId,
    )

    const isPublic = room.visibility !== 'PRIVATE'
    const loadActivityLogs = useActivityLogStore(
        (state) => state.loadActivityLogs,
    )
    const loadNotifications = useNotificationStore(
        (state) => state.loadNotifications,
    )
    const [placeError, setPlaceError] = useState<string | null>(null)
    const [categoryError, setCategoryError] = useState<string | null>(null)
    const [dateAvailabilityDirty, setDateAvailabilityDirty] = useState(false)
    const [categoryState, setCategoryState] = useState<{
        tripId: number
        items: PlaceCategoryInfo[]
        loading: boolean
    }>({ tripId, items: [], loading: true })
    const categories =
        categoryState.tripId === tripId ? categoryState.items : []
    const categoriesLoading =
        categoryState.tripId !== tripId || categoryState.loading
    const placeSearchCenter = useMemo(
        () => resolvePlaceSearchCenter(room, places),
        [room, places],
    )

    const canWrite = canManage
    const canPlanWrite = canWrite && room.lifecycleStatus !== 'COMPLETED'
    const hasConfirmedDates = Boolean(room.startDate && room.endDate)
    const commentPlace =
        places.find((place) => place.id === commentPlaceId) || null
    const { setComments, addComment, removeComment } = useCommentStore()

    useEffect(() => {
        const controller = new AbortController()
        getPlaceCategories(tripId, controller.signal)
            .then((nextCategories) => {
                setCategoryState({
                    tripId,
                    items: nextCategories,
                    loading: false,
                })
                setCategoryError(null)
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted) return
                setCategoryState({ tripId, items: [], loading: false })
                setCategoryError(
                    getApiErrorMessage(
                        error,
                        '장소 카테고리를 불러오지 못했습니다.',
                    ),
                )
            })
        return () => controller.abort()
    }, [tripId])

    function refreshCollaborationData() {
        void loadActivityLogs(tripId)
        void loadNotifications()
    }

    function requestDiscardDateChanges(onDiscard: () => void) {
        if (!dateAvailabilityDirty) {
            onDiscard()
            return
        }
        globalModal.open({
            ...UNSAVED_DATE_MODAL_COPY,
            showCancel: true,
            onConfirm: onDiscard,
        })
    }

    function handleBack() {
        requestDiscardDateChanges(onBack)
    }

    const refreshCommentSheet = useCallback(
        async (placeId: string) => {
            const mutationVersion = commentMutationVersionRef.current
            try {
                const comments = (
                    await getPlaceComments(tripId, Number(placeId))
                ).map(mapApiComment)
                if (mutationVersion !== commentMutationVersionRef.current) {
                    return
                }
                setComments(placeId, comments)
                onUpdatePlace(placeId, (place) => ({
                    ...place,
                    comments,
                    commentCount: comments.length,
                }))
            } catch (error) {
                setCommentError(
                    getApiErrorMessage(error, '댓글을 불러오지 못했습니다.'),
                )
            }
        },
        [onUpdatePlace, setComments, tripId],
    )

    function openCommentSheet(placeId: string) {
        setCommentError(null)
        setCommentPlaceId(placeId)
        void refreshCommentSheet(placeId)
    }

    useEffect(() => {
        if (realtimeVersion === 0 || commentPlaceId === null) return
        void Promise.resolve(commentPlaceId).then(refreshCommentSheet)
    }, [commentPlaceId, realtimeVersion, refreshCommentSheet])

    async function handleAddComment(placeId: string, text: string) {
        setCommentError(null)
        try {
            const comment = await addPlaceComment(tripId, Number(placeId), text)
            const newComment = mapApiComment(comment)
            commentMutationVersionRef.current += 1
            addComment(placeId, newComment)
            onUpdatePlace(placeId, (place) => ({
                ...place,
                comments: upsertPlaceComment(place.comments, newComment),
                commentCount: new Set([
                    ...place.comments.map((item) => item.id),
                    newComment.id,
                ]).size,
            }))
            refreshCollaborationData()
        } catch (error) {
            setCommentError(
                getApiErrorMessage(error, '댓글 등록에 실패했습니다.'),
            )
            throw error
        }
    }

    async function handleDeleteComment(placeId: string, commentId: string) {
        setCommentError(null)
        try {
            await deletePlaceComment(tripId, Number(placeId), Number(commentId))
            commentMutationVersionRef.current += 1
            removeComment(placeId, commentId)
            onUpdatePlace(placeId, (place) => ({
                ...place,
                comments: place.comments.filter((c) => c.id !== commentId),
                commentCount: Math.max(0, place.commentCount - 1),
            }))
            refreshCollaborationData()
        } catch (error) {
            setCommentError(
                getApiErrorMessage(error, '댓글 삭제에 실패했습니다.'),
            )
            throw error
        }
    }

    async function handleAdd(result: PlaceSearchResult) {
        setPlaceError(null)
        try {
            const tripPlace = await addTripPlace(tripId, result)
            const addedPlace = fromApiToPlace(tripPlace, room.id)
            onAddPlace(addedPlace)
            onSelectPlace(addedPlace.id)
            refreshCollaborationData()
        } catch (error) {
            setPlaceError(
                getApiErrorMessage(error, '장소 추가에 실패했습니다.'),
            )
            throw error
        }
    }

    async function handleCategoryChange(placeId: string, categoryId: number) {
        setPlaceError(null)
        try {
            const updated = await updateTripPlaceCategory(
                tripId,
                Number(placeId),
                categoryId,
            )
            const mapped = fromApiToPlace(updated, room.id)
            onUpdatePlace(placeId, (place) => ({
                ...place,
                category: mapped.category,
                categoryId: mapped.categoryId,
                categoryName: mapped.categoryName,
                categoryColor: mapped.categoryColor,
                categoryIcon: mapped.categoryIcon,
            }))
            refreshCollaborationData()
        } catch (error) {
            setPlaceError(
                getApiErrorMessage(
                    error,
                    '장소 카테고리를 변경하지 못했습니다.',
                ),
            )
        }
    }

    const selectedPlaceForOverlay =
        selectedId != null
            ? places.find((place) => place.id === selectedId)
            : undefined

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            {(() => {
                const header = (
                    <RoomHeader
                        title={room.title}
                        location={room.location}
                        date={room.date}
                        isPublic={isPublic}
                        isCompleted={room.lifecycleStatus === 'COMPLETED'}
                        canWrite={canWrite}
                        members={members}
                        currentMemberId={currentMemberId}
                        awarenessByMemberId={awarenessByMemberId}
                        onFollowMember={onFollowMember}
                        onInvite={() => setInviteOpen(true)}
                        onJoin={guestView ? onJoin : undefined}
                        onBack={handleBack}
                        onManage={onManage}
                        onVisibilityManage={onVisibilityManage}
                        showBackButton={showBackButton}
                    />
                )

                return headerContainer
                    ? createPortal(header, headerContainer)
                    : header
            })()}
            <div className="border-b border-slate-100 px-4 pb-3.5 pt-6">
                <div className="mb-3.5 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                        <div className="min-w-0">
                            <h2 className="text-2xl font-black leading-8 tracking-tight text-slate-900">
                                Plan
                            </h2>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                                가고 싶은 장소를 찾고 함께 여행 계획을
                                준비해보세요.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {onToggleMap && (
                            <button
                                onClick={onToggleMap}
                                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${mapCollapsed ? 'bg-brand-50 text-brand-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                                aria-label={
                                    mapCollapsed ? '지도 펼치기' : '지도 접기'
                                }
                                title={
                                    mapCollapsed ? '지도 펼치기' : '지도 접기'
                                }
                            >
                                {mapCollapsed ? (
                                    <PanelLeftOpenIcon size={18} />
                                ) : (
                                    <PanelLeftCloseIcon size={18} />
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => setActivityOpen((value) => !value)}
                            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${activityOpen ? 'bg-brand-50 text-brand-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                            aria-label="전체 활동 로그 열기"
                        >
                            <HistoryIcon size={18} />
                        </button>
                    </div>
                </div>
                <div className="flex items-center">
                    <div
                        className="flex min-w-0 flex-1 items-center gap-1"
                        role="tablist"
                        aria-label="계획 화면"
                    >
                        {[
                            {
                                key: 'places' as const,
                                label: '장소',
                                icon: ListIcon,
                            },
                            {
                                key: 'votes' as const,
                                label: '투표',
                                icon: VoteIcon,
                            },
                            {
                                key: 'schedule' as const,
                                label: '일정',
                                icon: MapIcon,
                            },
                        ].map((item) => {
                            const active =
                                item.key === 'schedule'
                                    ? planTab === 'itinerary' ||
                                      planTab === 'schedule'
                                    : planTab === item.key
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => {
                                        if (active) return
                                        onDeselectPlace?.()
                                        requestDiscardDateChanges(() => {
                                            setPlanTab(
                                                item.key === 'schedule' &&
                                                    !hasConfirmedDates
                                                    ? 'itinerary'
                                                    : item.key,
                                            )
                                        })
                                    }}
                                    role="tab"
                                    aria-selected={active}
                                    className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1.5 text-[13px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand @min-[560px]:px-3 @min-[560px]:text-sm ${active ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                                >
                                    <item.icon
                                        size={16}
                                        strokeWidth={active ? 2.5 : 2}
                                    />{' '}
                                    {item.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {(planTab === 'itinerary' || planTab === 'schedule') && (
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-2.5">
                    <nav
                        className="flex items-center gap-2"
                        aria-label="일정 준비 단계"
                    >
                        <button
                            type="button"
                            onClick={() => setPlanTab('itinerary')}
                            className={`outline-none transition-all duration-150 ${
                                planTab === 'itinerary'
                                    ? 'text-lg font-extrabold text-brand-700'
                                    : 'text-xs font-bold text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            날짜
                        </button>
                        <ChevronRightIcon
                            size={14}
                            className="shrink-0 text-slate-300"
                        />
                        <button
                            type="button"
                            disabled={!hasConfirmedDates}
                            onClick={() => setPlanTab('schedule')}
                            className={`outline-none transition-all duration-150 ${
                                planTab === 'schedule'
                                    ? 'text-lg font-extrabold text-brand-700'
                                    : hasConfirmedDates
                                      ? 'text-xs font-bold text-slate-400 hover:text-slate-600'
                                      : 'cursor-not-allowed text-xs font-bold text-slate-200'
                            }`}
                        >
                            일정
                        </button>
                    </nav>
                    {planTab === 'schedule' && !guestView && (
                        <button
                            type="button"
                            onClick={() => {
                                if (guestView) {
                                    onJoin?.()
                                    return
                                }
                                navigate(`/app/room/${room.id}/schedule`)
                            }}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-1.5 text-[11px] font-bold text-brand transition hover:bg-brand/10"
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                            </svg>
                            칸반 플래너로 열기
                        </button>
                    )}
                </div>
            )}

            {planTab === 'places' && (
                <div className="relative flex min-h-0 flex-1 flex-col">
                    <div className="border-b border-slate-100">
                        {canPlanWrite && (
                            <PlaceSearch
                                onAdd={handleAdd}
                                onFocus={onFocusSearchResult}
                                location={room.location || undefined}
                                latitude={placeSearchCenter.latitude}
                                longitude={placeSearchCenter.longitude}
                                existingGooglePlaceIds={
                                    new Set(
                                        places
                                            .map((p) => p.googlePlaceId)
                                            .filter((id): id is string => !!id),
                                    )
                                }
                                aiRecommendations={aiPlaceRecommendations}
                            />
                        )}
                        {(loadError || categoryError || placeError) && (
                            <p
                                role="alert"
                                className="mx-4 mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600"
                            >
                                {placeError ?? categoryError ?? loadError}
                            </p>
                        )}
                        <div className="flex items-center justify-between px-4 py-3">
                            <span className="text-xs font-bold text-slate-500">
                                총 등록 장소
                            </span>
                            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-extrabold text-brand-700">
                                {places.length}개
                            </span>
                        </div>
                    </div>
                    <div className="mp-scroll grid flex-1 auto-rows-max grid-cols-1 gap-2.5 overflow-y-auto px-4 py-3 @min-[760px]:grid-cols-2">
                        {places.length === 0 ? (
                            <p className="py-16 text-center text-sm text-slate-400">
                                해당하는 장소가 없어요
                            </p>
                        ) : (
                            places.map((place) => (
                                <PlaceCard
                                    key={place.id}
                                    place={place}
                                    addedByNickname={resolveMemberNickname(
                                        members,
                                        place.addedBy,
                                    )}
                                    selected={selectedId === place.id}
                                    canWrite={canPlanWrite}
                                    onSelect={() => onSelectPlace(place.id)}
                                    onDelete={async () => {
                                        setPlaceError(null)
                                        try {
                                            await deleteTripPlace(
                                                tripId,
                                                Number(place.id),
                                            )
                                            onDeletePlace(place.id)
                                            refreshCollaborationData()
                                        } catch (error) {
                                            setPlaceError(
                                                getApiErrorMessage(
                                                    error,
                                                    '장소 삭제에 실패했습니다.',
                                                ),
                                            )
                                        }
                                    }}
                                    onOpenComments={() =>
                                        void openCommentSheet(place.id)
                                    }
                                    categories={categories}
                                    categoriesLoading={categoriesLoading}
                                    onCategoryChange={(categoryId) =>
                                        handleCategoryChange(
                                            place.id,
                                            categoryId,
                                        )
                                    }
                                />
                            ))
                        )}
                    </div>
                    {selectedPlaceForOverlay && onDeselectPlace && (
                        <PlaceDetailOverlay
                            place={selectedPlaceForOverlay}
                            addedByNickname={resolveMemberNickname(
                                members,
                                selectedPlaceForOverlay.addedBy,
                            )}
                            onClose={onDeselectPlace}
                            onPlacePhotoResolved={onPlacePhotoResolved}
                        />
                    )}
                </div>
            )}
            {planTab === 'votes' && (
                <PlaceVotePanel
                    tripId={tripId}
                    places={places}
                    canWrite={canPlanWrite}
                    realtimeVersion={realtimeVersion}
                    onFocusPlace={onSelectPlace}
                />
            )}
            {planTab === 'itinerary' && (
                <div className="m-4 flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-slate-50/70">
                    {guestView ? (
                        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                            <CalendarDaysIcon
                                className="mb-3 text-brand-300"
                                size={32}
                            />
                            <h3 className="text-base font-extrabold text-slate-800">
                                로그인 후 여행 일정에 참여할 수 있어요
                            </h3>
                            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                                게스트는 여행방을 둘러볼 수 있으며, 가능한 날짜
                                선택과 투표는 로그인 후 이용할 수 있습니다.
                            </p>
                            {onJoin && (
                                <button
                                    type="button"
                                    onClick={onJoin}
                                    className="mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-700"
                                >
                                    로그인하고 참여하기
                                </button>
                            )}
                        </div>
                    ) : (
                        <DateVotePanel
                            tripId={tripId}
                            canWrite={canPlanWrite}
                            onDirtyChange={setDateAvailabilityDirty}
                            onCollaborationChanged={refreshCollaborationData}
                            onTripDatesChanged={() => {
                                onDeselectPlace?.()
                                void Promise.resolve(
                                    onTripDatesChanged?.(),
                                ).then(() => setPlanTab('schedule'))
                            }}
                            realtimeVersion={realtimeVersion}
                        />
                    )}
                </div>
            )}
            {planTab === 'schedule' && (
                <div className="m-4 flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-slate-50/70">
                    <SchedulePanel
                        key={`schedule-${itineraryVersion}`}
                        tripId={tripId}
                        places={places}
                        canWrite={canPlanWrite}
                        realtimeVersion={realtimeVersion}
                        onDaysLoaded={onItineraryDaysLoaded}
                        onPlaceFocus={onSelectPlace}
                        hoveredPlaceId={hoveredPlaceId}
                        onPlaceHoverChange={onHoverPlace}
                        onPlacePhotoResolved={onPlacePhotoResolved}
                        onPlaceDeselect={onDeselectPlace}
                        selectedPlaceId={selectedId}
                        members={members.filter((member) => !member.guest)}
                        focusDayNumber={focusDayRequest?.dayNumber ?? null}
                        focusDayVersion={focusDayRequest?.version ?? 0}
                    />
                </div>
            )}
            {activityOpen && (
                <div className="absolute inset-0 z-40 flex flex-col bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <div>
                            <p className="text-xs font-bold text-brand-700">
                                GLOBAL
                            </p>
                            <h3 className="mt-0.5 text-sm font-extrabold">
                                전체 활동
                            </h3>
                        </div>
                        <button
                            onClick={() => setActivityOpen(false)}
                            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200"
                        >
                            닫기
                        </button>
                    </div>
                    <div className="mp-scroll flex-1 overflow-y-auto">
                        <ActivityLogPanel
                            tripId={room.apiTripId}
                            allowGuest={guestView}
                        />
                    </div>
                </div>
            )}
            {commentPlace && (
                <CommentSheet
                    place={commentPlace}
                    canWrite={canWrite}
                    error={commentError}
                    onClose={() => {
                        setCommentPlaceId(null)
                        setCommentError(null)
                    }}
                    onAddComment={(text) =>
                        handleAddComment(commentPlace.id, text)
                    }
                    onDeleteComment={(commentId) =>
                        handleDeleteComment(commentPlace.id, commentId)
                    }
                />
            )}
            {inviteOpen &&
                room.apiTripId &&
                room.lifecycleStatus !== 'COMPLETED' && (
                    <InviteModal
                        tripId={room.apiTripId}
                        onClose={() => setInviteOpen(false)}
                    />
                )}
        </div>
    )
}
