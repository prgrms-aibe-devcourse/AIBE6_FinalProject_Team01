package back.backend.domain.expense.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import back.backend.domain.collaboration.service.CollaborationEventService;
import back.backend.domain.expense.dto.ExpenseCreateRequest;
import back.backend.domain.expense.dto.ExpenseUpdateRequest;
import back.backend.domain.expense.entity.Expense;
import back.backend.domain.expense.entity.ExpenseParticipant;
import back.backend.domain.expense.entity.ParticipantSettlementStatus;
import back.backend.domain.expense.entity.SplitType;
import back.backend.domain.expense.exception.ExpenseErrorCode;
import back.backend.domain.expense.repository.ExpenseParticipantRepository;
import back.backend.domain.expense.repository.ExpenseRepository;
import back.backend.domain.member.repository.MemberRepository;
import back.backend.domain.place.service.TripAccessChecker;
import back.backend.domain.trip.entity.Trip;
import back.backend.domain.trip.entity.TripStatus;
import back.backend.domain.trip.exception.TripErrorCode;
import back.backend.domain.trip.repository.TripMemberRepository;
import back.backend.domain.trip.repository.TripRepository;
import back.backend.global.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ExpenseServiceTest {

    @Mock ExpenseRepository expenseRepository;
    @Mock ExpenseParticipantRepository participantRepository;
    @Mock TripMemberRepository tripMemberRepository;
    @Mock TripRepository tripRepository;
    @Mock MemberRepository memberRepository;
    @Mock TripAccessChecker accessChecker;
    @Mock CollaborationEventService collaborationEventService;

    private ExpenseService expenseService;

    @BeforeEach
    void setUp() {
        expenseService = new ExpenseService(
                expenseRepository, participantRepository,
                tripMemberRepository, tripRepository, memberRepository,
                accessChecker, collaborationEventService);
    }

    private Expense expense(Long id, Long tripId, Long payerId) {
        return Expense.builder()
                .id(id).tripId(tripId).payerId(payerId).title("성심당 본점").category("FOOD")
                .totalAmount(new BigDecimal("48600.00")).currency("KRW")
                .expenseDate(LocalDate.of(2026, 8, 3)).splitType(SplitType.EQUAL)
                .createdBy(payerId).build();
    }

    private ExpenseParticipant participant(Long expenseId, Long memberId, ParticipantSettlementStatus status) {
        return ExpenseParticipant.builder()
                .expenseId(expenseId).memberId(memberId).shareAmount(new BigDecimal("16200.00"))
                .status(status).build();
    }

    @Test
    @DisplayName("t1 참여자 본인이 자신의 몫을 완료 처리하면 상태가 COMPLETED로 바뀐다")
    void t1_participantCanCompleteOwnShare() {
        Expense expense = expense(10L, 1L, 2L);
        ExpenseParticipant participant = participant(10L, 3L, ParticipantSettlementStatus.PENDING);
        given(accessChecker.requireRecordEdit(1L)).willReturn(3L);
        given(tripRepository.findById(1L)).willReturn(Optional.of(org.mockito.Mockito.mock(Trip.class)));
        given(expenseRepository.findById(10L)).willReturn(Optional.of(expense));
        given(participantRepository.findByExpenseIdAndMemberId(10L, 3L)).willReturn(Optional.of(participant));
        given(participantRepository.save(participant)).willReturn(participant);
        given(participantRepository.findAllByExpenseId(10L)).willReturn(List.of(participant));
        given(tripMemberRepository.findMemberIdsByTripId(1L)).willReturn(List.of(2L, 3L));
        given(memberRepository.findAllById(anyList())).willReturn(List.of());

        var result = expenseService.completeParticipant(1L, 10L, 3L);

        assertThat(participant.getStatus()).isEqualTo(ParticipantSettlementStatus.COMPLETED);
        assertThat(participant.getSettledAt()).isNotNull();
        assertThat(result.participants()).hasSize(1);
        verify(collaborationEventService).record(
                eq(1L), eq(3L), eq("EXPENSE_SETTLED"), eq("EXPENSE"), eq(10L),
                anyString(), anyMap(), any(), anyString());
    }

    @Test
    @DisplayName("t2 다른 사람은 타인의 정산 몫을 완료 처리할 수 없다")
    void t2_memberCannotCompleteAnotherMembersShare() {
        given(accessChecker.requireRecordEdit(1L)).willReturn(4L);

        assertThatThrownBy(() -> expenseService.completeParticipant(1L, 10L, 3L))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ExpenseErrorCode.SETTLEMENT_FORBIDDEN);
    }

    @Test
    @DisplayName("t3 결제자는 자신의 몫을 정산 완료 처리할 수 없다")
    void t3_payerCannotCompleteOwnPayerShare() {
        Expense expense = expense(10L, 1L, 2L);
        given(accessChecker.requireRecordEdit(1L)).willReturn(2L);
        given(tripRepository.findById(1L)).willReturn(Optional.of(org.mockito.Mockito.mock(Trip.class)));
        given(expenseRepository.findById(10L)).willReturn(Optional.of(expense));

        assertThatThrownBy(() -> expenseService.completeParticipant(1L, 10L, 2L))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ExpenseErrorCode.CANNOT_SETTLE_PAYER_SHARE);
    }

    @Test
    @DisplayName("t4 정산 요약은 지출별 참여자 완료 상태를 기준으로 받을 돈과 보낼 돈을 계산한다")
    void t4_settlementSummarizesByParticipantStatus() {
        Expense payerExpense = expense(10L, 1L, 2L);
        Expense otherExpense = expense(11L, 1L, 3L);
        given(accessChecker.requireView(1L)).willReturn(2L);
        given(expenseRepository.findAllByTripIdOrderByExpenseDateAscCreatedAtAscIdAsc(1L))
                .willReturn(List.of(payerExpense, otherExpense));
        given(participantRepository.findAllByExpenseIdIn(List.of(10L, 11L))).willReturn(List.of(
                participant(10L, 2L, ParticipantSettlementStatus.COMPLETED),
                participant(10L, 3L, ParticipantSettlementStatus.PENDING),
                participant(11L, 3L, ParticipantSettlementStatus.COMPLETED),
                participant(11L, 2L, ParticipantSettlementStatus.PENDING)));

        var result = expenseService.getSettlement(1L);

        assertThat(result.totalExpense()).isEqualByComparingTo("97200.00");
        assertThat(result.myReceivable()).isEqualByComparingTo("16200.00");
        assertThat(result.myPayable()).isEqualByComparingTo("16200.00");
        assertThat(result.pendingExpenseCount()).isEqualTo(2);
        assertThat(result.completedExpenseCount()).isEqualTo(0);
    }

    @Test
    @DisplayName("t5 지출을 수정하면 참여자 정산 상태가 초기화되고 결제자 몫은 완료로 처리된다")
    void t5_updateResetsParticipantSettlementStatus() {
        Expense expense = expense(10L, 1L, 2L);
        Trip trip = org.mockito.Mockito.mock(Trip.class);
        given(trip.getStartDate()).willReturn(LocalDate.of(2026, 8, 1));
        given(trip.getEndDate()).willReturn(LocalDate.of(2026, 8, 5));
        given(accessChecker.requireRecordEdit(1L)).willReturn(2L);
        given(tripRepository.findById(1L)).willReturn(Optional.of(trip));
        given(expenseRepository.findById(10L)).willReturn(Optional.of(expense));
        given(tripMemberRepository.findMemberIdsByTripId(1L)).willReturn(List.of(2L, 3L));
        given(participantRepository.saveAll(anyList())).willAnswer(invocation -> invocation.getArgument(0));
        given(memberRepository.findAllById(anyList())).willReturn(List.of());

        var request = new ExpenseUpdateRequest(
                "성심당 본점", "FOOD", new BigDecimal("40000"), LocalDate.of(2026, 8, 3), 2L,
                SplitType.EQUAL, List.of(2L, 3L), null, null);

        var result = expenseService.update(1L, 10L, request);

        assertThat(result.totalAmount()).isEqualByComparingTo("40000.00");
        assertThat(result.participants()).extracting("status")
                .containsExactlyInAnyOrder(
                        ParticipantSettlementStatus.COMPLETED, ParticipantSettlementStatus.PENDING);
        verify(collaborationEventService).record(
                eq(1L), eq(2L), eq("EXPENSE_UPDATED"), eq("EXPENSE"), eq(10L),
                anyString(), anyMap(), any(), anyString());
    }

    @Test
    @DisplayName("t6 존재하지 않는 여행방의 지출 목록은 도메인 예외를 반환한다")
    void t6_missingTripReturnsDomainException() {
        given(tripRepository.findById(99L)).willReturn(Optional.empty());

        assertThatThrownBy(() -> expenseService.getExpenses(99L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(TripErrorCode.TRIP_NOT_FOUND));
    }

    @Test
    @DisplayName("t7 완료된 여행방에서도 멤버는 회고용 지출을 등록할 수 있다")
    void t7_memberCanCreateExpenseForCompletedTrip() {
        Trip trip = org.mockito.Mockito.mock(Trip.class);
        given(trip.getStatus()).willReturn(TripStatus.COMPLETED);
        given(trip.getStartDate()).willReturn(LocalDate.of(2026, 8, 1));
        given(trip.getEndDate()).willReturn(LocalDate.of(2026, 8, 5));
        given(trip.getCurrency()).willReturn("KRW");
        given(accessChecker.requireRecordEdit(1L)).willReturn(2L);
        given(tripRepository.findById(1L)).willReturn(Optional.of(trip));
        given(tripMemberRepository.findMemberIdsByTripId(1L)).willReturn(List.of(2L, 3L));
        given(expenseRepository.save(org.mockito.ArgumentMatchers.any(Expense.class)))
                .willAnswer(invocation -> invocation.getArgument(0));
        given(participantRepository.saveAll(anyList()))
                .willAnswer(invocation -> invocation.getArgument(0));
        given(memberRepository.findAllById(anyList())).willReturn(List.of());
        var request = new ExpenseCreateRequest(
                "저녁 식사", "FOOD", new BigDecimal("40000"), LocalDate.of(2026, 8, 3),
                2L, SplitType.EQUAL, List.of(2L, 3L), null, null);

        var result = expenseService.create(1L, request);

        assertThat(trip.getStatus()).isEqualTo(TripStatus.COMPLETED);
        assertThat(result.totalAmount()).isEqualByComparingTo("40000.00");
        verify(accessChecker).requireRecordEdit(1L);
        verify(accessChecker, never()).requireEdit(1L);
    }
}
