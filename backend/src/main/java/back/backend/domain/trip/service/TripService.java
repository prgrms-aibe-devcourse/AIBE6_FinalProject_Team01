package back.backend.domain.trip.service;

import back.backend.domain.member.repository.MemberRepository;
import back.backend.domain.card.entity.PlanCard;
import back.backend.domain.card.repository.PlanCardRepository;
import back.backend.domain.collaboration.activitylog.dto.ActivityLogCreateCommand;
import back.backend.domain.collaboration.activitylog.service.ActivityLogService;
import back.backend.domain.collaboration.notification.dto.NotificationCreateCommand;
import back.backend.domain.collaboration.notification.entity.NotificationType;
import back.backend.domain.collaboration.notification.service.NotificationService;
import back.backend.domain.trip.dto.TripRequest;
import back.backend.domain.trip.dto.TripResponse;
import back.backend.domain.trip.dto.TripMemberResponse;
import back.backend.domain.trip.dto.TripVisibilityRequest;
import back.backend.domain.trip.entity.Trip;
import back.backend.domain.trip.entity.TripMember;
import back.backend.domain.trip.entity.TripStatus;
import back.backend.domain.trip.exception.TripErrorCode;
import back.backend.domain.trip.repository.TripMemberRepository;
import back.backend.domain.trip.repository.TripRepository;
import back.backend.global.exception.BusinessException;
import back.backend.global.exception.CommonErrorCode;
import back.backend.global.realtime.RealtimeEvent;
import back.backend.domain.place.service.TripAccessChecker;
import back.backend.domain.itinerary.repository.ItineraryDayRepository;
import back.backend.domain.travelrecord.repository.TravelRecordRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TripService {

    private final TripRepository tripRepository;
    private final TripMemberRepository tripMemberRepository;
    private final MemberRepository memberRepository;
    private final ActivityLogService activityLogService;
    private final NotificationService notificationService;
    private final PlanCardRepository planCardRepository;
    private final TripPresenceService tripPresenceService;
    private final TripAccessChecker tripAccessChecker;
    private final ItineraryDayRepository itineraryDayRepository;
    private final TravelRecordRepository travelRecordRepository;
    private final Clock clock;
    private final ApplicationEventPublisher eventPublisher;
    private final GuestTripAccessService guestTripAccessService;

    public TripService(TripRepository tripRepository, TripMemberRepository tripMemberRepository,
                       MemberRepository memberRepository,
                       ActivityLogService activityLogService,
                       NotificationService notificationService,
                       PlanCardRepository planCardRepository,
                       TripPresenceService tripPresenceService,
                       TripAccessChecker tripAccessChecker,
                       ItineraryDayRepository itineraryDayRepository,
                       TravelRecordRepository travelRecordRepository,
                       Clock clock,
                       ApplicationEventPublisher eventPublisher,
                       GuestTripAccessService guestTripAccessService) {
        this.tripRepository = tripRepository;
        this.tripMemberRepository = tripMemberRepository;
        this.memberRepository = memberRepository;
        this.activityLogService = activityLogService;
        this.notificationService = notificationService;
        this.planCardRepository = planCardRepository;
        this.tripPresenceService = tripPresenceService;
        this.tripAccessChecker = tripAccessChecker;
        this.itineraryDayRepository = itineraryDayRepository;
        this.travelRecordRepository = travelRecordRepository;
        this.clock = clock;
        this.eventPublisher = eventPublisher;
        this.guestTripAccessService = guestTripAccessService;
    }

    @Transactional
    public TripResponse create(Long memberId, TripRequest request) {
        if (!memberRepository.existsById(memberId)) {
            throw new BusinessException(CommonErrorCode.NOT_FOUND);
        }
        Trip trip = saveValidTrip(memberId, request);
        tripMemberRepository.save(TripMember.member(trip.getId(), memberId));
        recordEvent(trip, memberId, "TRIP_CREATED", "여행방을 생성했습니다.");
        return toResponse(trip);
    }

    public List<TripResponse> getMyTrips(Long memberId) {
        List<Trip> trips = tripRepository.findAllAccessibleByMemberIdAndStatusNot(
                memberId, TripStatus.CANCELLED);
        if (trips.isEmpty()) {
            return List.of();
        }
        Map<Long, Long> memberCounts = tripMemberRepository.countAllByTripIds(
                        trips.stream().map(Trip::getId).toList()).stream()
                .collect(Collectors.toMap(
                        TripMemberRepository.TripMemberCount::getTripId,
                        TripMemberRepository.TripMemberCount::getMemberCount));
        return trips.stream()
                .map(trip -> TripResponse.from(
                        trip, memberCounts.getOrDefault(trip.getId(), 0L)))
                .toList();
    }

    public TripResponse get(Long memberId, Long tripId) {
        Trip trip = tripRepository.findByIdAndStatusNot(tripId, TripStatus.CANCELLED)
                .orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_NOT_FOUND));
        if (tripMemberRepository.existsByTripIdAndMemberId(tripId, memberId)) {
            return toResponse(trip);
        }
        throw new BusinessException(TripErrorCode.TRIP_NOT_FOUND);
    }

    public List<TripMemberResponse> getMembers(Long tripId) {
        Long memberId = tripAccessChecker.requireView(tripId);
        if (memberId != null) {
            tripPresenceService.touch(tripId, memberId);
        }
        List<TripMemberResponse> members = new java.util.ArrayList<>(memberRepository
                .findAllById(tripMemberRepository.findMemberIdsByTripId(tripId))
                .stream()
                .map(member -> new TripMemberResponse(
                        member.getId(),
                        member.getNickname(),
                        member.getProfileImageUrl(),
                        tripPresenceService.isOnline(tripId, member.getId()),
                        false))
                .toList());
        List<Long> guestSessionIds = guestTripAccessService.getActiveGuestSessionIds(tripId);
        for (int index = 0; index < guestSessionIds.size(); index++) {
            Long guestSessionId = guestSessionIds.get(index);
            members.add(new TripMemberResponse(
                    -guestSessionId,
                    "게스트 " + (index + 1),
                    null,
                    tripPresenceService.isGuestOnline(tripId, guestSessionId),
                    true));
        }
        return List.copyOf(members);
    }

    public void markPresent(Long tripId, String guestToken) {
        Long memberId = tripAccessChecker.requireView(tripId);
        Long realtimeMemberId = memberId;
        if (memberId == null) {
            Long guestSessionId = guestTripAccessService.requireGuestSessionId(tripId, guestToken);
            tripPresenceService.touchGuest(tripId, guestSessionId);
            realtimeMemberId = -guestSessionId;
        } else {
            tripPresenceService.touch(tripId, memberId);
        }
        eventPublisher.publishEvent(RealtimeEvent.tripMembers(tripId, realtimeMemberId));
    }

    @Transactional
    public TripResponse update(Long memberId, Long tripId, TripRequest request) {
        Trip trip = findJoinedTripWithoutLock(memberId, tripId);
        LocalDate previousStartDate = trip.getStartDate();
        try {
            trip.update(request.title(), request.companionType(), request.normalizedTravelStyles(),
                    request.destination(), request.destinationLat(), request.destinationLng(),
                    request.startDate(), request.endDate(),
                    request.dayStartTime(), request.dayEndTime(), request.travelPace());
            trip.updateDestinationMetadata(
                    request.destinationEnglishName(), request.destinationCountryCode());
            moveDatedTripContent(tripId, previousStartDate, request.startDate());
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(TripErrorCode.INVALID_TRIP);
        } catch (IllegalStateException exception) {
            throw new BusinessException(TripErrorCode.TRIP_ALREADY_FINISHED);
        }
        recordEvent(trip, memberId, "TRIP_UPDATED", "여행방 정보를 수정했습니다.");
        return toResponse(trip);
    }

    private void moveDatedTripContent(Long tripId, LocalDate previousStartDate, LocalDate newStartDate) {
        if (previousStartDate == null || newStartDate == null) {
            return;
        }
        long days = ChronoUnit.DAYS.between(previousStartDate, newStartDate);
        var itineraryDays = itineraryDayRepository.findAllByTripIdOrderByItineraryDateAsc(tripId);
        Map<LocalDate, Integer> dayNumbersByPreviousDate = new HashMap<>();
        itineraryDays.forEach(day -> dayNumbersByPreviousDate.put(day.getItineraryDate(), day.getDayNumber()));

        travelRecordRepository.findAllByTripIdOrderByVisitedAtDescIdDesc(tripId).forEach(record -> {
            Integer dayNumber = dayNumbersByPreviousDate.get(record.getVisitedAt().toLocalDate());
            if (dayNumber != null) {
                record.moveVisitedDateTo(newStartDate.plusDays(dayNumber - 1L));
            } else if (days != 0) {
                record.moveVisitedAtByDays(days);
            }
        });
        itineraryDays.forEach(day ->
                day.updateItineraryDate(LocalDate.of(1000, 1, 1).plusDays(day.getDayNumber())));
        itineraryDayRepository.flush();
        itineraryDays.forEach(day ->
                day.updateItineraryDate(newStartDate.plusDays(day.getDayNumber() - 1L)));
    }

    @Transactional
    public TripResponse updateVisibility(Long memberId, Long tripId, TripVisibilityRequest request) {
        Trip trip = findJoinedTripWithoutLock(memberId, tripId);
        if (trip.getStatus() != TripStatus.COMPLETED) {
            throw new BusinessException(TripErrorCode.TRIP_VISIBILITY_NOT_AVAILABLE);
        }
        trip.changeVisibility(request.visibility());
        PlanCard card = planCardRepository.findByTripId(tripId)
                .orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_CARD_NOT_FOUND));
        card.changeVisibility(request.visibility());
        recordEvent(trip, memberId, "TRIP_VISIBILITY_UPDATED", "여행방 공개 설정을 변경했습니다.");
        return toResponse(trip);
    }

    @Transactional
    public void delete(Long memberId, Long tripId) {
        Trip trip = findJoinedTrip(memberId, tripId);
        if (tripMemberRepository.countByTripId(tripId) > 1) {
            throw new BusinessException(TripErrorCode.TRIP_HAS_OTHER_MEMBERS);
        }
        tripRepository.delete(trip);
    }

    @Transactional
    public void leave(Long memberId, Long tripId) {
        Trip trip = findJoinedTrip(memberId, tripId);
        if (tripMemberRepository.countByTripId(tripId) <= 1) {
            throw new BusinessException(TripErrorCode.LAST_TRIP_MEMBER);
        }
        recordEvent(trip, memberId, "TRIP_LEFT", "멤버가 여행방을 나갔습니다.");
        tripMemberRepository.deleteByTripIdAndMemberId(tripId, memberId);
    }

    private Trip saveValidTrip(Long memberId, TripRequest request) {
        try {
            Trip trip = Trip.create(memberId, request.title(), request.companionType(),
                    request.normalizedTravelStyles(), request.destination(),
                    request.destinationLat(), request.destinationLng(),
                    request.startDate(), request.endDate());
            trip.updateDestinationMetadata(
                    request.destinationEnglishName(), request.destinationCountryCode());
            return tripRepository.save(trip);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(TripErrorCode.INVALID_TRIP);
        }
    }

    private Trip findJoinedTripWithoutLock(Long memberId, Long tripId) {
        return tripRepository.findByIdAndMemberIdAndStatusNot(tripId, memberId, TripStatus.CANCELLED)
                .orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_NOT_FOUND));
    }

    private Trip findJoinedTrip(Long memberId, Long tripId) {
        Trip trip = tripRepository.findByIdAndStatusNotForMembershipChange(tripId, TripStatus.CANCELLED)
                .orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_NOT_FOUND));
        if (!tripMemberRepository.existsByTripIdAndMemberId(tripId, memberId)) {
            throw new BusinessException(TripErrorCode.TRIP_NOT_FOUND);
        }
        return trip;
    }

    private TripResponse toResponse(Trip trip) {
        return TripResponse.from(trip, tripMemberRepository.countByTripId(trip.getId()));
    }

    private void recordEvent(Trip trip, Long actorId, String actionType, String description) {
        activityLogService.create(new ActivityLogCreateCommand(
                trip.getId(), actorId, actionType, "TRIP", trip.getId(), description,
                Map.of("title", trip.getTitle(), "status", trip.getStatus().name())));

        List<Long> recipients = tripMemberRepository.findMemberIdsByTripId(trip.getId());
        if (recipients.isEmpty()) recipients = List.of(actorId);
        for (Long recipientId : recipients) {
            notificationService.create(new NotificationCreateCommand(
                    recipientId, trip.getId(), NotificationType.TRIP, "여행방 알림", description, "TRIP", trip.getId()));
        }
    }
}
