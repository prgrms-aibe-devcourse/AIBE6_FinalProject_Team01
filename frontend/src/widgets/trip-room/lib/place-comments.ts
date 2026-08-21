import type { Comment } from '@/entities/trip'

export function upsertPlaceComment(
    comments: Comment[],
    incoming: Comment,
): Comment[] {
    const existingIndex = comments.findIndex(
        (comment) => comment.id === incoming.id,
    )
    if (existingIndex < 0) return [...comments, incoming]

    return comments.map((comment, index) =>
        index === existingIndex ? incoming : comment,
    )
}
