import assert from 'node:assert/strict'
import test from 'node:test'

import { getTripCopyDefaults } from './trip-copy-defaults.ts'

test('t1 원본 여행에 지역이 있으면 새 여행 제목과 목적지 기본값에 반영한다', () => {
    assert.deepEqual(
        getTripCopyDefaults({ title: '여름 휴가', destination: '제주도' }),
        { title: '제주도 여행', destinationName: '제주도' },
    )
})

test('t2 원본 여행의 지역이 없으면 카드 제목으로 새 여행 제목을 만든다', () => {
    assert.deepEqual(
        getTripCopyDefaults({ title: '여름 휴가', destination: null }),
        { title: '여름 휴가 여행', destinationName: null },
    )
})
