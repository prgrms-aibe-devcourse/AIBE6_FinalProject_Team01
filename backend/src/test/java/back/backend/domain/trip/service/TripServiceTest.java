package back.backend.domain.trip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

import back.backend.domain.member.repository.MemberRepository;
import back.backend.domain.card.repository.PlanCardRepository;
import back.backend.domain.place.service.TripAccessChecker;
import back.backend.domain.itinerary.entity.ItineraryDay;
import back.backend.domain.itinerary.repository.ItineraryDayRepository;
import back.backend.domain.travelrecord.entity.TravelRecord;
import back.backend.domain.travelrecord.repository.TravelRecordRepository;
import back.backend.domain.collaboration.activitylog.service.ActivityLogService;
import back.backend.domain.collaboration.notification.service.NotificationService;
import back.backend.domain.trip.dto.TripRequest;
import back.backend.domain.trip.dto.TripVisibilityRequest;
import back.backend.domain.trip.entity.TripVisibility;
import back.backend.domain.card.entity.PlanCard;
import back.backend.domain.trip.entity.CompanionType;
import back.backend.domain.trip.entity.TravelStyle;
import back.backend.domain.trip.entity.Trip;
import back.backend.domain.trip.entity.TripStatus;
import back.backend.domain.trip.exception.TripErrorCode;
import back.backend.domain.trip.repository.TripMemberRepository;
import back.backend.domain.trip.repository.TripRepository;
import back.backend.global.exception.BusinessException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.context.ApplicationEventPublisher;
import back.backend.global.realtime.RealtimeEvent;

@ExtendWith(MockitoExtension.class)
class TripServiceTest {
    @Mock TripRepository tripRepository;
    @Mock TripMemberRepository tripMemberRepository;
    @Mock MemberRepository memberRepository;
    @Mock ActivityLogService activityLogService;
    @Mock NotificationService notificationService;
    @Mock PlanCardRepository planCardRepository;
    @Mock TripPresenceService tripPresenceService;
    @Mock TripAccessChecker tripAccessChecker;
    @Mock ItineraryDayRepository itineraryDayRepository;
    @Mock TravelRecordRepository travelRecordRepository;
    @Mock ApplicationEventPublisher eventPublisher;
    @Mock GuestTripAccessService guestTripAccessService;
    private TripService tripService;
    private final Clock clock = Clock.fixed(
            Instant.parse("2026-07-31T00:00:00Z"),
            ZoneId.of("Asia/Seoul")
    );

    @BeforeEach
    void setUp() {
        tripService = new TripService(tripRepository, tripMemberRepository, memberRepository,
                activityLogService, notificationService, planCardRepository,
                tripPresenceService, tripAccessChecker, itineraryDayRepository,
                travelRecordRepository, clock, eventPublisher, guestTripAccessService);
    }

    @Test
    @DisplayName("t1 회원이 유효한 정보로 여행방을 생성하면 소유자 멤버십도 저장한다")
    void t1_createTripSavesTripAndOwnerMembership() {
        when(memberRepository.existsById(1L)).thenReturn(true);
        when(tripRepository.save(any(Trip.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = tripService.create(1L, request("제주 여행"));

        assertThat(response.title()).isEqualTo("제주 여행");
        verify(tripMemberRepository).save(any());
    }

    @Test
    @DisplayName("t2 회원이 본인 여행방 목록을 조회하면 생성 역순 결과를 반환한다")
    void t2_getMyTripsReturnsOwnedTrips() {
        Trip first = trip("제주 여행");
        Trip second = trip("부산 여행");
        ReflectionTestUtils.setField(first, "id", 10L);
        ReflectionTestUtils.setField(second, "id", 20L);
        when(tripRepository.findAllAccessibleByMemberIdAndStatusNot(1L, TripStatus.CANCELLED))
                .thenReturn(List.of(first, second));
        when(tripMemberRepository.countAllByTripIds(List.of(10L, 20L)))
                .thenReturn(List.of(tripCount(10L, 2L), tripCount(20L, 3L)));

        assertThat(tripService.getMyTrips(1L))
                .extracting("title", "memberCount")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("제주 여행", 2L),
                        org.assertj.core.groups.Tuple.tuple("부산 여행", 3L));
        verify(tripMemberRepository, never()).countByTripId(any());
    }

    @Test
    @DisplayName("t3 여행방 멤버는 생성자가 아니어도 여행방을 수정할 수 있다")
    void t3_joinedMemberCanUpdateTrip() {
        Trip trip = trip("제주 여행");
        when(tripRepository.findByIdAndMemberIdAndStatusNot(10L, 2L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));

        var response = tripService.update(2L, 10L, request("수정"));

        assertThat(response.title()).isEqualTo("수정");
    }

    @Test
    @DisplayName("t4 마지막 멤버가 여행방을 삭제하면 여행방 행을 물리 삭제한다")
    void t4_deleteTripPhysicallyDeletesTrip() {
        Trip trip = trip("제주 여행");
        when(tripRepository.findByIdAndStatusNotForMembershipChange(10L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));
        when(tripMemberRepository.existsByTripIdAndMemberId(10L, 1L)).thenReturn(true);
        when(tripMemberRepository.countByTripId(10L)).thenReturn(1L);

        tripService.delete(1L, 10L);

        verify(tripRepository).delete(trip);
        verify(activityLogService, never()).create(any());
        verify(notificationService, never()).create(any());
    }

    @Test
    @DisplayName("t5 여행방 생성 시 공개 요청이 포함되어도 완료 전에는 비공개로 저장한다")
    void t5_createTripAlwaysSavesPrivateVisibility() {
        when(memberRepository.existsById(1L)).thenReturn(true);
        when(tripRepository.save(any(Trip.class))).thenAnswer(invocation -> {
            Trip savedTrip = invocation.getArgument(0);
            ReflectionTestUtils.setField(savedTrip, "id", 10L);
            return savedTrip;
        });

        TripRequest request = new TripRequest(
                "제주 여행", CompanionType.FRIENDS, Set.of(TravelStyle.FOOD), "제주도",
                null, null, TripVisibility.PUBLIC_ROUTE, null, null, null);

        var response = tripService.create(1L, request);

        assertThat(response.visibility()).isEqualTo(TripVisibility.PRIVATE);
    }

    @Test
    @DisplayName("t6 완료된 여행방의 공개 범위를 변경하면 자동 생성된 카드 공개 범위도 함께 변경한다")
    void t6_updateVisibilitySynchronizesCompletedTripCard() {
        Trip trip = Trip.create(
                1L, "제주 여행", null, Set.of(), null,
                LocalDate.of(2026, 7, 28), LocalDate.of(2026, 7, 31));
        ReflectionTestUtils.setField(trip, "id", 10L);
        trip.completeAutomatically(LocalDate.of(2026, 8, 1));
        PlanCard card = PlanCard.create(10L, "제주 여행", TripVisibility.PRIVATE, 1L);
        when(tripRepository.findByIdAndMemberIdAndStatusNot(10L, 1L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));
        when(planCardRepository.findByTripId(10L)).thenReturn(Optional.of(card));

        var response = tripService.updateVisibility(
                1L, 10L, new TripVisibilityRequest(TripVisibility.PUBLIC_ROUTE));

        assertThat(response.visibility()).isEqualTo(TripVisibility.PUBLIC_ROUTE);
        assertThat(card.getVisibility()).isEqualTo(TripVisibility.PUBLIC_ROUTE);
        verify(activityLogService).create(any());
        verify(notificationService).create(any());
    }

    @Test
    @DisplayName("t7 완료되지 않은 여행방의 공개 범위를 변경하면 예외가 발생한다")
    void t7_updateVisibilityRejectsTripBeforeCompletion() {
        Trip trip = trip("제주 여행");
        when(tripRepository.findByIdAndMemberIdAndStatusNot(10L, 1L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));

        assertThatThrownBy(() -> tripService.updateVisibility(
                1L, 10L, new TripVisibilityRequest(TripVisibility.PUBLIC_ROUTE)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(TripErrorCode.TRIP_VISIBILITY_NOT_AVAILABLE));
    }

    @Test
    @DisplayName("t8 다른 멤버가 남아 있는 여행방은 삭제할 수 없다")
    void t8_deleteTripRejectsWhenOtherMembersRemain() {
        Trip trip = trip("제주 여행");
        when(tripRepository.findByIdAndStatusNotForMembershipChange(10L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));
        when(tripMemberRepository.existsByTripIdAndMemberId(10L, 1L)).thenReturn(true);
        when(tripMemberRepository.countByTripId(10L)).thenReturn(2L);

        assertThatThrownBy(() -> tripService.delete(1L, 10L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(TripErrorCode.TRIP_HAS_OTHER_MEMBERS));

        assertThat(trip.getStatus()).isNotEqualTo(TripStatus.CANCELLED);
    }

    @Test
    @DisplayName("t9 멤버가 여행방을 나가면 멤버십만 삭제하고 여행 데이터는 유지한다")
    void t9_leaveTripDeletesOnlyMembership() {
        Trip trip = trip("제주 여행");
        when(tripRepository.findByIdAndStatusNotForMembershipChange(10L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));
        when(tripMemberRepository.existsByTripIdAndMemberId(10L, 1L)).thenReturn(true);
        when(tripMemberRepository.countByTripId(10L)).thenReturn(2L);

        tripService.leave(1L, 10L);

        verify(tripMemberRepository).deleteByTripIdAndMemberId(10L, 1L);
        verify(tripRepository, never()).delete(any());
        assertThat(trip.getStatus()).isNotEqualTo(TripStatus.CANCELLED);
    }

    @Test
    @DisplayName("t10 마지막 멤버는 여행방 나가기 대신 삭제해야 한다")
    void t10_leaveTripRejectsLastMember() {
        Trip trip = trip("제주 여행");
        when(tripRepository.findByIdAndStatusNotForMembershipChange(10L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));
        when(tripMemberRepository.existsByTripIdAndMemberId(10L, 1L)).thenReturn(true);
        when(tripMemberRepository.countByTripId(10L)).thenReturn(1L);

        assertThatThrownBy(() -> tripService.leave(1L, 10L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(TripErrorCode.LAST_TRIP_MEMBER));
    }

    @Test
    @DisplayName("t11 여행방 생성 시 오늘 또는 과거 시작일을 허용한다")
    void t11_createTripAllowsTodayOrPastStartDate() {
        when(memberRepository.existsById(1L)).thenReturn(true);
        when(tripRepository.save(any(Trip.class))).thenAnswer(invocation -> invocation.getArgument(0));

        for (LocalDate startDate : List.of(
                LocalDate.of(2026, 7, 30),
                LocalDate.of(2026, 7, 31))) {
            TripRequest request = new TripRequest(
                    "제주 여행",
                    CompanionType.FRIENDS,
                    Set.of(TravelStyle.FOOD),
                    "제주도",
                    startDate,
                    startDate.plusDays(2),
                    TripVisibility.PRIVATE,
                    null,
                    null,
                    null
            );

            var response = tripService.create(1L, request);

            assertThat(response.startDate()).isEqualTo(startDate);
        }

        verify(tripRepository, times(2)).save(any());
    }

    @Test
    @DisplayName("t12 여행방 수정 시 오늘 또는 과거 시작일을 허용한다")
    void t12_updateTripAllowsTodayOrPastStartDate() {
        Trip trip = trip("제주 여행");
        when(tripRepository.findByIdAndMemberIdAndStatusNot(10L, 2L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));
        TripRequest request = new TripRequest(
                "수정 여행",
                CompanionType.FRIENDS,
                Set.of(TravelStyle.FOOD),
                "제주도",
                LocalDate.of(2026, 7, 31),
                LocalDate.of(2026, 8, 2),
                TripVisibility.PRIVATE,
                null,
                null,
                null
        );

        var response = tripService.update(2L, 10L, request);

        assertThat(response.startDate()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertThat(response.endDate()).isEqualTo(LocalDate.of(2026, 8, 2));
    }

    @Test
    @DisplayName("t13 진행 중인 여행방은 기존 시작일을 유지하면 다른 정보를 수정할 수 있다")
    void t13_updateTripAllowsUnchangedPastStartDate() {
        LocalDate startDate = LocalDate.of(2026, 7, 30);
        Trip trip = Trip.create(
                1L, "제주 여행", CompanionType.FRIENDS, Set.of(TravelStyle.FOOD),
                "제주도", startDate, LocalDate.of(2026, 8, 2)
        );
        when(tripRepository.findByIdAndMemberIdAndStatusNot(10L, 2L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));
        TripRequest request = new TripRequest(
                "수정 여행", CompanionType.FRIENDS, Set.of(TravelStyle.FOOD), "제주도",
                startDate, LocalDate.of(2026, 8, 2), TripVisibility.PRIVATE,
                null, null, null
        );

        var response = tripService.update(2L, 10L, request);

        assertThat(response.title()).isEqualTo("수정 여행");
    }

    private TripRequest request(String title) {
        return new TripRequest(title, CompanionType.FRIENDS, Set.of(TravelStyle.FOOD), "제주도",
                LocalDate.of(2026, 8, 12), LocalDate.of(2026, 8, 15), TripVisibility.PRIVATE, null, null, null);
    }

    @Test
    @DisplayName("t14 여행방 생성 시 목적지 영문명과 국가 코드를 보존한다")
    void t14_createTripPreservesDestinationMetadata() {
        when(memberRepository.existsById(1L)).thenReturn(true);
        when(tripRepository.save(any(Trip.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TripRequest request = new TripRequest(
                "괌 여행", null, Set.of(), "괌", 13.4443, 144.7937,
                null, null, null, null, null, null, "Guam", "GU");

        var response = tripService.create(1L, request);

        assertThat(response.destinationEnglishName()).isEqualTo("Guam");
        assertThat(response.destinationCountryCode()).isEqualTo("GU");
    }

    @Test
    @DisplayName("t15 여행 기간을 이동하면 기존 일정과 여행 기록의 상대 Day를 유지한다")
    void t15_updateTripDatesPreservesItineraryAndTravelRecordDayNumbers() {
        Trip trip = Trip.create(
                1L, "제주 여행", CompanionType.FRIENDS, Set.of(TravelStyle.FOOD),
                "제주도", LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 3)
        );
        ItineraryDay itineraryDay = ItineraryDay.create(
                10L, LocalDate.of(2026, 8, 2), 2
        );
        TravelRecord travelRecord = TravelRecord.builder()
                .tripId(10L)
                .placeId(20L)
                .recordedBy(1L)
                .visitedAt(LocalDateTime.of(2026, 8, 2, 14, 30))
                .memo("기존 기록")
                .build();
        when(tripRepository.findByIdAndMemberIdAndStatusNot(10L, 1L, TripStatus.CANCELLED))
                .thenReturn(Optional.of(trip));
        when(itineraryDayRepository.findAllByTripIdOrderByItineraryDateAsc(10L))
                .thenReturn(List.of(itineraryDay));
        when(travelRecordRepository.findAllByTripIdOrderByVisitedAtDescIdDesc(10L))
                .thenReturn(List.of(travelRecord));
        TripRequest request = new TripRequest(
                "제주 여행", CompanionType.FRIENDS, Set.of(TravelStyle.FOOD), "제주도",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 3),
                TripVisibility.PRIVATE, null, null, null
        );

        tripService.update(1L, 10L, request);

        assertThat(itineraryDay.getItineraryDate()).isEqualTo(LocalDate.of(2026, 7, 2));
        assertThat(travelRecord.getVisitedAt()).isEqualTo(LocalDateTime.of(2026, 7, 2, 14, 30));
    }

    @Test
    @DisplayName("t16 여행방 멤버가 접속 상태를 갱신하면 온라인 시각과 실시간 이벤트를 기록한다")
    void t16_markPresentTouchesPresenceAndPublishesRealtimeEvent() {
        when(tripAccessChecker.requireView(10L)).thenReturn(2L);

        tripService.markPresent(10L, null);

        verify(tripPresenceService).touch(10L, 2L);
        verify(eventPublisher).publishEvent(any(RealtimeEvent.class));
    }

    @Test
    @DisplayName("t17 게스트가 접속 상태를 갱신하면 게스트 온라인 시각을 기록한다")
    void t17_guestMarkPresentTouchesGuestPresence() {
        when(tripAccessChecker.requireView(10L)).thenReturn(null);
        when(guestTripAccessService.requireGuestSessionId(10L, "guest-token")).thenReturn(7L);

        tripService.markPresent(10L, "guest-token");

        verify(tripPresenceService).touchGuest(10L, 7L);
        verify(eventPublisher).publishEvent(any(RealtimeEvent.class));
    }

    @Test
    @DisplayName("t18 여행방 멤버 목록에는 활성 게스트와 온라인 상태를 포함한다")
    void t18_getMembersIncludesActiveGuests() {
        when(tripAccessChecker.requireView(10L)).thenReturn(1L);
        when(tripMemberRepository.findMemberIdsByTripId(10L)).thenReturn(List.of());
        when(memberRepository.findAllById(List.of())).thenReturn(List.of());
        when(guestTripAccessService.getActiveGuestSessionIds(10L)).thenReturn(List.of(7L));
        when(tripPresenceService.isGuestOnline(10L, 7L)).thenReturn(true);

        var result = tripService.getMembers(10L);

        assertThat(result).singleElement().satisfies(guest -> {
            assertThat(guest.memberId()).isEqualTo(-7L);
            assertThat(guest.nickname()).isEqualTo("게스트 1");
            assertThat(guest.guest()).isTrue();
            assertThat(guest.online()).isTrue();
        });
    }

    private Trip trip(String title) {
        return Trip.create(1L, title, null, Set.of(), null, null, null);
    }

    private TripMemberRepository.TripMemberCount tripCount(Long tripId, long memberCount) {
        return new TripMemberRepository.TripMemberCount() {
            @Override
            public Long getTripId() {
                return tripId;
            }

            @Override
            public long getMemberCount() {
                return memberCount;
            }
        };
    }
}
