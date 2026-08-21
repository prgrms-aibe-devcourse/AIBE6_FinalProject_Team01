import { create } from 'zustand'
import type { Comment } from '@/entities/trip'

interface CommentStore {
    commentsByPlaceId: Record<string, Comment[]>
    setComments: (placeId: string, comments: Comment[]) => void
    addComment: (placeId: string, comment: Comment) => void
    removeComment: (placeId: string, commentId: string) => void
}

export const useCommentStore = create<CommentStore>((set) => ({
    commentsByPlaceId: {},
    setComments: (placeId, comments) =>
        set((state) => ({
            commentsByPlaceId: {
                ...state.commentsByPlaceId,
                [placeId]: comments,
            },
        })),
    addComment: (placeId, comment) =>
        set((state) => ({
            commentsByPlaceId: {
                ...state.commentsByPlaceId,
                [placeId]: (state.commentsByPlaceId[placeId] ?? []).some(
                    (existing) => existing.id === comment.id,
                )
                    ? (state.commentsByPlaceId[placeId] ?? []).map((existing) =>
                          existing.id === comment.id ? comment : existing,
                      )
                    : [...(state.commentsByPlaceId[placeId] ?? []), comment],
            },
        })),
    removeComment: (placeId, commentId) =>
        set((state) => ({
            commentsByPlaceId: {
                ...state.commentsByPlaceId,
                [placeId]: (state.commentsByPlaceId[placeId] ?? []).filter(
                    (c) => c.id !== commentId,
                ),
            },
        })),
}))
