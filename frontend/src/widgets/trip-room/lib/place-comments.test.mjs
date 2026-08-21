import assert from 'node:assert/strict'
import test from 'node:test'

import { upsertPlaceComment } from './place-comments.ts'

test('t1 실시간 재조회와 작성 응답이 겹쳐도 같은 댓글을 중복 추가하지 않는다', () => {
    const comment = {
        id: '10',
        memberId: '3',
        text: '좋아요',
        createdAt: '2026-08-21T12:00:00',
    }

    assert.deepEqual(upsertPlaceComment([comment], comment), [comment])
})

test('t2 기존 댓글 수정 응답은 같은 위치에서 최신 값으로 교체한다', () => {
    const previous = {
        id: '10',
        memberId: '3',
        text: '기존',
        createdAt: '2026-08-21T12:00:00',
    }
    const updated = { ...previous, text: '수정' }

    assert.deepEqual(upsertPlaceComment([previous], updated), [updated])
})
