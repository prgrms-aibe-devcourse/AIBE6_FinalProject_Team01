import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    copyCardItinerary,
    type PublicCard,
} from '@/features/explore-card'
import {
    CreateTripModal,
    getTripCopyDefaults,
} from '@/features/manage-trip'

export function ItineraryCopyFlow({
    card,
    onClose,
}: {
    card: PublicCard
    onClose: () => void
}) {
    const navigate = useNavigate()
    const [step, setStep] = useState<'confirm' | 'success'>('confirm')
    const [createOpen, setCreateOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [copyError, setCopyError] = useState<string | null>(null)
    const [copiedTripId, setCopiedTripId] = useState<number | null>(null)
    const defaults = getTripCopyDefaults(card)

    async function copy(targetTripId: number) {
        setLoading(true)
        setCopyError(null)
        try {
            await copyCardItinerary(card.id, targetTripId, 'APPEND')
            setCopiedTripId(targetTripId)
            setStep('success')
        } catch (error) {
            setCopyError(
                error instanceof Error
                    ? error.message
                    : '일정을 담지 못했습니다.',
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {!createOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4">
                    <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                        {step === 'confirm' && (
                            <>
                                <h2 className="text-center text-xl font-black">
                                    이 일정을 새 여행으로 담을까요?
                                </h2>
                                <p className="mt-3 text-center text-sm leading-6 text-slate-500">
                                    장소와 일정만 담으며 기록·사진·비용·개인
                                    메모는 제외합니다.
                                </p>
                                {copyError && (
                                    <p className="mt-4 text-sm font-semibold text-red-500">
                                        {copyError}
                                    </p>
                                )}
                                <div className="mt-7 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="rounded-xl bg-slate-100 py-3 font-bold text-slate-500"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() => setCreateOpen(true)}
                                        className="rounded-xl bg-brand py-3 font-extrabold text-white disabled:opacity-50"
                                    >
                                        새 여행 만들어 담기
                                    </button>
                                </div>
                            </>
                        )}
                        {step === 'success' && copiedTripId && (
                            <>
                                <h2 className="text-center text-2xl font-black">
                                    일정을 담았습니다.
                                </h2>
                                <p className="mt-3 text-center text-sm text-slate-500">
                                    저장한 여행방에서 장소와 일정을 확인하세요.
                                </p>
                                <button
                                    type="button"
                                    onClick={() =>
                                        navigate(`/app/room/${copiedTripId}`)
                                    }
                                    className="mt-7 w-full rounded-xl bg-brand py-3 font-extrabold text-white"
                                >
                                    완료
                                </button>
                            </>
                        )}
                    </section>
                </div>
            )}
            {createOpen && (
                <CreateTripModal
                    onClose={() => setCreateOpen(false)}
                    requireDates
                    inviteAfterCreate={false}
                    initialTitle={defaults.title}
                    initialDestinationName={defaults.destinationName}
                    initialDestination={
                        card.destination != null &&
                        card.destinationLat != null &&
                        card.destinationLng != null
                            ? {
                                  name: card.destination,
                                  englishName:
                                      card.destinationEnglishName ??
                                      card.destination,
                                  countryCode: card.destinationCountryCode,
                                  lat: card.destinationLat,
                                  lng: card.destinationLng,
                              }
                            : null
                    }
                    onCreated={(tripId) => {
                        setCreateOpen(false)
                        void copy(tripId)
                    }}
                />
            )}
        </>
    )
}
