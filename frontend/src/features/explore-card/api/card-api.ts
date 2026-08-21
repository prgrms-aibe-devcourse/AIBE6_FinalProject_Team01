import { apiClient, type ApiResponse } from '@/shared/api/client'
import type { ItineraryDay } from '@/entities/trip'

export type CardSort = 'LATEST' | 'POPULAR' | 'COMMENTS'
export type PublicCard = {
    id: number
    tripId: number
    authorId: number
    authorNickname: string
    title: string
    summary: string | null
    destination: string | null
    destinationLat: number | null
    destinationLng: number | null
    destinationEnglishName: string | null
    destinationCountryCode: string | null
    coverImageUrl: string | null
    travelStyles: string[]
    tags: string[]
    bookmarkCount: number
    commentCount: number
    bookmarked: boolean
    ownCard: boolean
    createdAt: string
}
export type PublicCardPage = {
    content: PublicCard[]
    page: number
    size: number
    totalElements: number
    totalPages: number
}
type PageResponse<T> = {
    content: T[]
    page: number
    size: number
    totalElements: number
    totalPages: number
    first: boolean
    last: boolean
    empty: boolean
}
export type CardComment = {
    id: number
    memberId: number
    memberNickname: string
    content: string
    mine: boolean
    createdAt: string
}
export type CopyTarget = {
    tripId: number
    title: string
    destination: string | null
    startDate: string
    endDate: string
    coverImageUrl: string | null
    hasItinerary: boolean
}
export type PublicCardDetail = {
    cardId: number
    tripId: number
    title: string
    summary: string | null
    destination: string | null
    coverImageUrl: string | null
    startDate: string | null
    endDate: string | null
    visibility: 'PUBLIC_ROUTE' | 'PUBLIC_RECORD'
    itinerary: ItineraryDay[]
    records: PublicCardRecord[]
    travelStyles: string[]
    tags: string[]
}
export type PublicCardRecord = {
    id: number
    tripPlaceId: number | null
    placeName: string
    categoryName: string | null
    address: string | null
    memo: string | null
    imageUrls: string[]
    recordedByNickname: string
    visitedAt: string
}
export type TripSharedBookmark = {
    card: PublicCard
    sharerNicknames: string[]
    sharedByMe: boolean
}
export async function fetchPublicCards(
    page: number,
    sort: CardSort,
    query: string,
    travelStyle: string | null,
) {
    const params = new URLSearchParams({ page: String(page), size: '6', sort })
    if (query.trim()) params.set('query', query.trim())
    if (travelStyle) params.set('travelStyle', travelStyle)
    return (
        await apiClient.get<ApiResponse<PublicCardPage>>(
            `/api/cards/public?${params}`,
        )
    ).data
}
export async function fetchBookmarkedCards() {
    const response = await apiClient.get<ApiResponse<PageResponse<PublicCard>>>(
        '/api/cards/bookmarks?page=0&size=100',
    )
    return response.data.content
}
export async function fetchPublicCardDetail(cardId: number) {
    return (
        await apiClient.get<ApiResponse<PublicCardDetail>>(
            `/api/cards/${cardId}/detail`,
        )
    ).data
}
export async function addBookmark(cardId: number) {
    await apiClient.post(`/api/cards/${cardId}/bookmarks`, {})
}
export async function removeBookmark(cardId: number) {
    await apiClient.delete(`/api/cards/${cardId}/bookmarks`)
}
export async function shareBookmarkToTrip(tripId: number, cardId: number) {
    await apiClient.post(`/api/trips/${tripId}/bookmarks/${cardId}`, {})
}
export async function unshareBookmarkFromTrip(tripId: number, cardId: number) {
    await apiClient.delete(`/api/trips/${tripId}/bookmarks/${cardId}`)
}
export async function fetchTripSharedBookmarks(tripId: number) {
    const response = await apiClient.get<
        ApiResponse<PageResponse<TripSharedBookmark>>
    >(`/api/trips/${tripId}/bookmarks?page=0&size=100`)
    return response.data.content
}
export async function fetchCardComments(cardId: number) {
    const response = await apiClient.get<
        ApiResponse<PageResponse<CardComment>>
    >(`/api/cards/${cardId}/comments?page=0&size=100`)
    return response.data.content
}
export async function addCardComment(cardId: number, content: string) {
    return (
        await apiClient.post<ApiResponse<CardComment>>(
            `/api/cards/${cardId}/comments`,
            { content },
        )
    ).data
}
export async function deleteCardComment(cardId: number, commentId: number) {
    await apiClient.delete(`/api/cards/${cardId}/comments/${commentId}`)
}
export async function fetchCopyTargets() {
    return (
        await apiClient.get<ApiResponse<CopyTarget[]>>(
            '/api/cards/copy-targets',
        )
    ).data
}
export async function copyCardItinerary(
    cardId: number,
    targetTripId: number,
    mode: 'REPLACE' | 'APPEND',
) {
    await apiClient.post(`/api/cards/${cardId}/itinerary-copy`, {
        targetTripId,
        mode,
    })
}
