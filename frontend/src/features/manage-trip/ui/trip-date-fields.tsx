import { globalModal } from '@/shared/model'

type TripDateFieldsProps = {
    startDate: string
    endDate: string
    onStartDateChange: (value: string) => void
    onEndDateChange: (value: string) => void
    minimumDate: string
}

export function TripDateFields({
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    minimumDate,
}: TripDateFieldsProps) {
    function rejectPastDate() {
        globalModal.open({
            title: '지난 날짜는 선택할 수 없습니다.',
            description: '오늘 이후의 여행 날짜를 선택해 주세요.',
            confirmText: '확인',
        })
    }

    function changeDate(value: string, onChange: (value: string) => void) {
        if (value && value < minimumDate) {
            rejectPastDate()
            return
        }
        onChange(value)
    }

    const minimumEndDate =
        startDate && startDate > minimumDate ? startDate : minimumDate
    return (
        <div className="mt-3.5 grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">
                시작일
                <input
                    type="date"
                    value={startDate}
                    min={minimumDate}
                    onChange={(event) =>
                        changeDate(event.target.value, onStartDateChange)
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                />
            </label>
            <label className="text-sm font-bold">
                종료일
                <input
                    type="date"
                    value={endDate}
                    min={minimumEndDate}
                    onChange={(event) =>
                        changeDate(event.target.value, onEndDateChange)
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                />
            </label>
        </div>
    )
}
