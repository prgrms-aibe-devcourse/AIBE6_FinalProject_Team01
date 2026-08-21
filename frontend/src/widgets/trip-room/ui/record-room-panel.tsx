import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ItineraryDay, Place, Room } from '@/entities/trip'
import { ExpensePanel, type ExpenseResponse } from '@/features/manage-expense'
import { InviteModal } from '@/features/invite-member'
import { useTripMembers } from '@/features/manage-trip'
import { RecordPanel } from './record-panel'
import { RoomHeader } from './room-header'

type Props = {
    room: Room
    places: Place[]
    itineraryDays: ItineraryDay[]
    tripId: number
    expenseRealtimeVersion?: number
    canManage: boolean
    guestView?: boolean
    onJoin?: () => void
    onBack: () => void
    onManage: () => void
    onVisibilityManage: () => void
    headerContainer?: HTMLElement | null
}

export function RecordRoomPanel({
    room,
    places,
    itineraryDays,
    tripId,
    expenseRealtimeVersion = 0,
    canManage,
    guestView = false,
    onJoin,
    onBack,
    onManage,
    onVisibilityManage,
    headerContainer,
}: Props) {
    const [inviteOpen, setInviteOpen] = useState(false)
    const [expenseComposerOpen, setExpenseComposerOpen] = useState(false)
    const [editingExpense, setEditingExpense] =
        useState<ExpenseResponse | null>(null)
    const [expenseRevision, setExpenseRevision] = useState(0)
    const { members } = useTripMembers(tripId)

    const header = (
        <RoomHeader
            title={room.title}
            location={room.location}
            date={room.date}
            isPublic={room.visibility !== 'PRIVATE'}
            isCompleted={room.lifecycleStatus === 'COMPLETED'}
            canWrite={canManage}
            members={members}
            onInvite={() => setInviteOpen(true)}
            onJoin={guestView ? onJoin : undefined}
            onBack={onBack}
            onManage={onManage}
            onVisibilityManage={onVisibilityManage}
            showBackButton={false}
        />
    )

    return (
        <section className="relative flex min-h-0 flex-1 flex-col">
            {headerContainer ? createPortal(header, headerContainer) : header}
            <RecordPanel
                tripId={tripId}
                places={places}
                itineraryDays={itineraryDays}
                canWrite={canManage}
                canManageExpenses={canManage}
                startDate={room.startDate}
                endDate={room.endDate}
                onOpenExpenses={() => {
                    setEditingExpense(null)
                    setExpenseComposerOpen(true)
                }}
                onEditExpense={(expense) => {
                    setEditingExpense(expense)
                    setExpenseComposerOpen(true)
                }}
                expenseRevision={expenseRevision + expenseRealtimeVersion}
            />

            {expenseComposerOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <ExpensePanel
                        tripId={tripId}
                        canWrite={canManage}
                        composerOnly
                        initialComposerOpen
                        initialEditingExpense={editingExpense}
                        onComposerClose={() => {
                            setExpenseComposerOpen(false)
                            setEditingExpense(null)
                        }}
                        onChanged={() =>
                            setExpenseRevision((revision) => revision + 1)
                        }
                    />,
                    document.body,
                )}

            {inviteOpen && room.lifecycleStatus !== 'COMPLETED' && (
                <InviteModal
                    tripId={tripId}
                    onClose={() => setInviteOpen(false)}
                />
            )}
        </section>
    )
}
