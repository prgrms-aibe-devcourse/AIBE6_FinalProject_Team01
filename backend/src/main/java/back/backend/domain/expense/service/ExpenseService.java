package back.backend.domain.expense.service;

import back.backend.domain.collaboration.notification.entity.NotificationType;
import back.backend.domain.collaboration.service.CollaborationEventService;
import back.backend.domain.expense.dto.*;
import back.backend.domain.expense.entity.*;
import back.backend.domain.expense.exception.ExpenseErrorCode;
import back.backend.domain.expense.repository.*;
import back.backend.domain.member.entity.Member;
import back.backend.domain.member.repository.MemberRepository;
import back.backend.domain.place.service.TripAccessChecker;
import back.backend.domain.trip.entity.Trip;
import back.backend.domain.trip.exception.TripErrorCode;
import back.backend.domain.trip.repository.*;
import back.backend.global.exception.BusinessException;
import java.math.*;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ExpenseService {
    private final ExpenseRepository expenseRepository;
    private final ExpenseParticipantRepository participantRepository;
    private final TripMemberRepository tripMemberRepository;
    private final TripRepository tripRepository;
    private final MemberRepository memberRepository;
    private final TripAccessChecker accessChecker;
    private final CollaborationEventService collaborationEventService;

    public ExpenseService(
            ExpenseRepository expenseRepository, ExpenseParticipantRepository participantRepository,
            TripMemberRepository tripMemberRepository, TripRepository tripRepository,
            MemberRepository memberRepository, TripAccessChecker accessChecker,
            CollaborationEventService collaborationEventService
    ) {
        this.expenseRepository = expenseRepository;
        this.participantRepository = participantRepository;
        this.tripMemberRepository = tripMemberRepository;
        this.tripRepository = tripRepository;
        this.memberRepository = memberRepository;
        this.accessChecker = accessChecker;
        this.collaborationEventService = collaborationEventService;
    }

    @Transactional
    public ExpenseResponse create(Long tripId, ExpenseCreateRequest request) {
        Long actorId = accessChecker.requireRecordEdit(tripId);
        Trip trip = findTrip(tripId);
        validateExpenseDate(trip, request.expenseDate());
        List<Long> tripMemberIds = tripMemberRepository.findMemberIdsByTripId(tripId);
        LinkedHashSet<Long> participantIds = new LinkedHashSet<>(request.participantIds());
        if (participantIds.isEmpty()) throw new BusinessException(ExpenseErrorCode.INVALID_PARTICIPANTS);
        if (!tripMemberIds.contains(request.payerId()) || !tripMemberIds.containsAll(participantIds)) {
            throw new BusinessException(ExpenseErrorCode.MEMBER_NOT_IN_TRIP);
        }
        Map<Long, BigDecimal> shares = calculateShares(
                request.totalAmount(), request.splitType(), request.customShares(), participantIds);
        Expense expense = expenseRepository.save(Expense.builder()
                .tripId(tripId).payerId(request.payerId()).title(request.title().trim())
                .category(request.category()).totalAmount(money(request.totalAmount()))
                .currency(trip.getCurrency()).expenseDate(request.expenseDate())
                .splitType(request.splitType()).memo(request.memo()).createdBy(actorId).build());
        List<ExpenseParticipant> savedParticipants = saveParticipants(expense.getId(), request.payerId(), shares);
        collaborationEventService.record(
                tripId, actorId, "EXPENSE_CREATED", "EXPENSE", expense.getId(),
                expense.getTitle() + " 지출 " + expense.getTotalAmount().toPlainString() + "원이 등록됐습니다.",
                Map.of("title", expense.getTitle(), "amount", expense.getTotalAmount()),
                NotificationType.SETTLEMENT, "지출 등록");
        return toResponse(expense, savedParticipants, trip, memberNames(tripMemberIds));
    }

    @Transactional
    public ExpenseResponse update(Long tripId, Long expenseId, ExpenseUpdateRequest request) {
        Long actorId = accessChecker.requireRecordEdit(tripId);
        Trip trip = findTrip(tripId);
        Expense expense = findExpense(tripId, expenseId);
        validateExpenseDate(trip, request.expenseDate());
        List<Long> tripMemberIds = tripMemberRepository.findMemberIdsByTripId(tripId);
        LinkedHashSet<Long> participantIds = new LinkedHashSet<>(request.participantIds());
        if (participantIds.isEmpty()) throw new BusinessException(ExpenseErrorCode.INVALID_PARTICIPANTS);
        if (!tripMemberIds.contains(request.payerId()) || !tripMemberIds.containsAll(participantIds)) {
            throw new BusinessException(ExpenseErrorCode.MEMBER_NOT_IN_TRIP);
        }
        Map<Long, BigDecimal> shares = calculateShares(
                request.totalAmount(), request.splitType(), request.customShares(), participantIds);
        expense.update(
                request.title().trim(), request.category(), money(request.totalAmount()),
                request.expenseDate(), request.payerId(), request.splitType(), request.memo());
        participantRepository.deleteAllByExpenseId(expenseId);
        List<ExpenseParticipant> savedParticipants = saveParticipants(expenseId, request.payerId(), shares);
        collaborationEventService.record(
                tripId, actorId, "EXPENSE_UPDATED", "EXPENSE", expenseId,
                expense.getTitle() + " 지출 내역이 수정됐습니다.",
                Map.of("title", expense.getTitle(), "amount", expense.getTotalAmount()),
                NotificationType.SETTLEMENT, "지출 수정");
        return toResponse(expense, savedParticipants, trip, memberNames(tripMemberIds));
    }

    public List<ExpenseResponse> getExpenses(Long tripId) {
        accessChecker.requireView(tripId);
        Trip trip = findTrip(tripId);
        List<Expense> expenses = expenseRepository.findAllByTripIdOrderByExpenseDateAscCreatedAtAscIdAsc(tripId);
        List<Long> ids = expenses.stream().map(Expense::getId).toList();
        Map<Long, List<ExpenseParticipant>> participantsByExpense = ids.isEmpty() ? Map.of()
                : participantRepository.findAllByExpenseIdIn(ids).stream()
                .collect(Collectors.groupingBy(ExpenseParticipant::getExpenseId));
        Map<Long, String> names = memberNames(tripMemberRepository.findMemberIdsByTripId(tripId));
        return expenses.stream().map(expense -> toResponse(
                expense, participantsByExpense.getOrDefault(expense.getId(), List.of()), trip, names)).toList();
    }

    public ExpenseContextResponse getContext(Long tripId) {
        accessChecker.requireView(tripId);
        Trip trip = findTrip(tripId);
        List<Long> memberIds = tripMemberRepository.findMemberIdsByTripId(tripId);
        List<ExpenseMemberResponse> members = memberRepository.findAllById(memberIds).stream()
                .sorted(Comparator.comparing(Member::getId))
                .map(member -> new ExpenseMemberResponse(
                        member.getId(), member.getNickname(), member.getProfileImageUrl()))
                .toList();
        return new ExpenseContextResponse(
                trip.getStartDate(),
                trip.getEndDate(),
                members,
                trip.getStartDate() != null && trip.getEndDate() != null);
    }

    public SettlementSummaryResponse getSettlement(Long tripId) {
        Long viewerId = accessChecker.requireView(tripId);
        List<Expense> expenses = expenseRepository.findAllByTripIdOrderByExpenseDateAscCreatedAtAscIdAsc(tripId);
        List<Long> expenseIds = expenses.stream().map(Expense::getId).toList();
        Map<Long, List<ExpenseParticipant>> participantsByExpense = expenseIds.isEmpty() ? Map.of()
                : participantRepository.findAllByExpenseIdIn(expenseIds).stream()
                .collect(Collectors.groupingBy(ExpenseParticipant::getExpenseId));

        BigDecimal totalExpense = expenses.stream().map(Expense::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal myReceivable = BigDecimal.ZERO;
        BigDecimal myPayable = BigDecimal.ZERO;
        int pendingExpenseCount = 0;
        int completedExpenseCount = 0;

        for (Expense expense : expenses) {
            List<ExpenseParticipant> participants = participantsByExpense.getOrDefault(expense.getId(), List.of());
            List<ExpenseParticipant> others = participants.stream()
                    .filter(participant -> !participant.getMemberId().equals(expense.getPayerId()))
                    .toList();
            boolean allSettled = others.stream()
                    .allMatch(participant -> participant.getStatus() == ParticipantSettlementStatus.COMPLETED);
            if (allSettled) completedExpenseCount++; else pendingExpenseCount++;

            if (expense.getPayerId().equals(viewerId)) {
                myReceivable = myReceivable.add(pendingShareTotal(others));
            } else {
                myPayable = myPayable.add(pendingShareTotal(participants.stream()
                        .filter(participant -> participant.getMemberId().equals(viewerId))
                        .toList()));
            }
        }
        return new SettlementSummaryResponse(totalExpense, myReceivable, myPayable, pendingExpenseCount, completedExpenseCount);
    }

    @Transactional
    public ExpenseResponse completeParticipant(Long tripId, Long expenseId, Long memberId) {
        Long actorId = accessChecker.requireRecordEdit(tripId);
        if (!actorId.equals(memberId)) {
            throw new BusinessException(ExpenseErrorCode.SETTLEMENT_FORBIDDEN);
        }
        Trip trip = findTrip(tripId);
        Expense expense = findExpense(tripId, expenseId);
        if (expense.getPayerId().equals(memberId)) {
            throw new BusinessException(ExpenseErrorCode.CANNOT_SETTLE_PAYER_SHARE);
        }
        ExpenseParticipant participant = participantRepository.findByExpenseIdAndMemberId(expenseId, memberId)
                .orElseThrow(() -> new BusinessException(ExpenseErrorCode.PARTICIPANT_NOT_FOUND));
        participant.markSettled();
        participantRepository.save(participant);
        List<ExpenseParticipant> participants = participantRepository.findAllByExpenseId(expenseId);
        collaborationEventService.record(
                tripId, actorId, "EXPENSE_SETTLED", "EXPENSE", expenseId,
                expense.getTitle() + " 지출의 정산 상태가 변경됐습니다.",
                Map.of("memberId", memberId),
                NotificationType.SETTLEMENT, "정산 완료");
        return toResponse(expense, participants, trip, memberNames(tripMemberRepository.findMemberIdsByTripId(tripId)));
    }

    private Expense findExpense(Long tripId, Long expenseId) {
        return expenseRepository.findById(expenseId)
                .filter(expense -> expense.getTripId().equals(tripId))
                .orElseThrow(() -> new BusinessException(ExpenseErrorCode.EXPENSE_NOT_FOUND));
    }

    private Trip findTrip(Long tripId) {
        return tripRepository.findById(tripId)
                .orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_NOT_FOUND));
    }

    private List<ExpenseParticipant> saveParticipants(Long expenseId, Long payerId, Map<Long, BigDecimal> shares) {
        LocalDateTime now = LocalDateTime.now();
        return participantRepository.saveAll(shares.entrySet().stream()
                .map(entry -> {
                    boolean isPayer = entry.getKey().equals(payerId);
                    return ExpenseParticipant.builder()
                            .expenseId(expenseId).memberId(entry.getKey()).shareAmount(entry.getValue())
                            .status(isPayer ? ParticipantSettlementStatus.COMPLETED : ParticipantSettlementStatus.PENDING)
                            .settledAt(isPayer ? now : null)
                            .build();
                })
                .toList());
    }

    private BigDecimal pendingShareTotal(List<ExpenseParticipant> participants) {
        return participants.stream()
                .filter(participant -> participant.getStatus() == ParticipantSettlementStatus.PENDING)
                .map(ExpenseParticipant::getShareAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Map<Long, BigDecimal> calculateShares(
            BigDecimal totalAmount, SplitType splitType, Map<Long, BigDecimal> customShares, Set<Long> participantIds) {
        BigDecimal total = money(totalAmount);
        if (splitType == SplitType.CUSTOM) {
            Map<Long, BigDecimal> custom = customShares == null ? Map.of() : customShares;
            if (!custom.keySet().equals(participantIds)
                    || money(custom.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add)).compareTo(total) != 0) {
                throw new BusinessException(ExpenseErrorCode.INVALID_CUSTOM_SHARES);
            }
            return custom.entrySet().stream().collect(Collectors.toMap(
                    Map.Entry::getKey, entry -> money(entry.getValue()), (a, b) -> a, LinkedHashMap::new));
        }
        List<Long> sorted = participantIds.stream().sorted().toList();
        BigDecimal divisor = BigDecimal.valueOf(sorted.size());
        BigDecimal base = total.divide(divisor, 2, RoundingMode.DOWN);
        int remainingCents = total.subtract(base.multiply(divisor)).movePointRight(2).intValueExact();
        Map<Long, BigDecimal> result = new LinkedHashMap<>();
        for (int index = 0; index < sorted.size(); index++) {
            result.put(sorted.get(index), base.add(index < remainingCents ? new BigDecimal("0.01") : BigDecimal.ZERO));
        }
        return result;
    }

    private ExpenseResponse toResponse(
            Expense expense, List<ExpenseParticipant> participants, Trip trip, Map<Long, String> names) {
        Integer day = expense.getExpenseDate() == null || trip.getStartDate() == null ? null
                : Math.toIntExact(ChronoUnit.DAYS.between(trip.getStartDate(), expense.getExpenseDate()) + 1);
        return new ExpenseResponse(
                expense.getId(), expense.getTitle(), expense.getCategory(), expense.getTotalAmount(),
                expense.getCurrency(), expense.getExpenseDate(), day, expense.getPayerId(),
                names.get(expense.getPayerId()), expense.getSplitType(),
                participants.stream().map(participant -> new ExpenseResponse.ParticipantShareResponse(
                        participant.getMemberId(), names.get(participant.getMemberId()),
                        participant.getShareAmount(), participant.getStatus(), participant.getSettledAt())).toList(),
                expense.getMemo());
    }

    private Map<Long, String> memberNames(List<Long> ids) {
        return memberRepository.findAllById(ids).stream().collect(Collectors.toMap(Member::getId, Member::getNickname));
    }

    private BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private void validateExpenseDate(Trip trip, java.time.LocalDate expenseDate) {
        if (trip.getStartDate() == null || trip.getEndDate() == null) {
            throw new BusinessException(ExpenseErrorCode.TRIP_SCHEDULE_REQUIRED);
        }
        if (expenseDate.isBefore(trip.getStartDate()) || expenseDate.isAfter(trip.getEndDate())) {
            throw new BusinessException(ExpenseErrorCode.EXPENSE_DATE_OUT_OF_RANGE);
        }
    }
}
