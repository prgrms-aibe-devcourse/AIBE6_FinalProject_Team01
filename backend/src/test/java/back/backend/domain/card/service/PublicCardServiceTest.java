package back.backend.domain.card.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.then;

import back.backend.domain.card.dto.CardSort;
import back.backend.domain.card.entity.PlanCard;
import back.backend.domain.card.entity.CardComment;
import back.backend.domain.card.repository.*;
import back.backend.domain.member.repository.MemberRepository;
import back.backend.domain.trip.entity.TripVisibility;
import back.backend.domain.trip.entity.Trip;
import back.backend.domain.trip.entity.TravelStyle;
import back.backend.domain.trip.repository.TripMemberRepository;
import back.backend.domain.trip.repository.TripRepository;
import back.backend.global.exception.BusinessException;
import back.backend.global.exception.CommonErrorCode;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class PublicCardServiceTest {
    @Mock PlanCardRepository cardRepository;
    @Mock SavedTripRepository savedRepository;
    @Mock CardCommentRepository commentRepository;
    @Mock PlanCardTagRepository cardTagRepository;
    @Mock TripTagRepository tagRepository;
    @Mock TripRepository tripRepository;
    @Mock TripMemberRepository tripMemberRepository;
    @Mock MemberRepository memberRepository;
    @Mock ApplicationEventPublisher eventPublisher;
    @Mock TripCardBookmarkShareRepository shareRepository;

    @Test
    @DisplayName("t1 본인이 만든 공개 카드를 북마크하면 권한 예외가 발생한다")
    void t1_bookmarkRejectsOwnCard() {
        PlanCard card = PlanCard.create(10L, "제주 여행", TripVisibility.PUBLIC_ROUTE, 1L);
        ReflectionTestUtils.setField(card, "id", 20L);
        when(cardRepository.findById(20L)).thenReturn(Optional.of(card));
        PublicCardService service = new PublicCardService(
                cardRepository, savedRepository, commentRepository, cardTagRepository,
                tagRepository, tripRepository, tripMemberRepository, memberRepository, eventPublisher,
                shareRepository);

        assertThatThrownBy(() -> service.bookmark(1L, 20L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> org.assertj.core.api.Assertions.assertThat(exception.getErrorCode())
                                .isEqualTo(CommonErrorCode.FORBIDDEN));
    }

    @Test
    @DisplayName("t2 여행에 참여했던 멤버가 공개 카드를 북마크하면 권한 예외가 발생한다")
    void t2_bookmarkRejectsTripParticipantCard() {
        PlanCard card = PlanCard.create(10L, "제주 여행", TripVisibility.PUBLIC_ROUTE, 1L);
        ReflectionTestUtils.setField(card, "id", 20L);
        when(cardRepository.findById(20L)).thenReturn(Optional.of(card));
        when(tripMemberRepository.existsByTripIdAndMemberId(10L, 2L)).thenReturn(true);
        PublicCardService service = new PublicCardService(
                cardRepository, savedRepository, commentRepository, cardTagRepository,
                tagRepository, tripRepository, tripMemberRepository, memberRepository, eventPublisher,
                shareRepository);

        assertThatThrownBy(() -> service.bookmark(2L, 20L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> org.assertj.core.api.Assertions.assertThat(exception.getErrorCode())
                                .isEqualTo(CommonErrorCode.FORBIDDEN));
    }

    @Test
    @DisplayName("t3 여행에 참여했던 멤버에게 공개 카드를 내 카드로 응답한다")
    void t3_publicCardMarksTripParticipantAsOwnCard() {
        PlanCard card = PlanCard.create(10L, "제주 여행", TripVisibility.PUBLIC_ROUTE, 1L);
        ReflectionTestUtils.setField(card, "id", 20L);
        Trip trip = Trip.create(1L, "제주 여행", null, Set.of(TravelStyle.FOOD), "제주", null, null);
        ReflectionTestUtils.setField(trip, "id", 10L);
        ReflectionTestUtils.setField(trip, "destinationLat", 37.5665);
        ReflectionTestUtils.setField(trip, "destinationLng", 126.9780);
        ReflectionTestUtils.setField(trip, "destinationEnglishName", "Seoul");
        ReflectionTestUtils.setField(trip, "destinationCountryCode", "KR");
        when(cardRepository.findAllByVisibilityNotOrderByCreatedAtDesc(
                org.mockito.ArgumentMatchers.eq(TripVisibility.PRIVATE), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(card)));
        when(tripRepository.findAllById(List.of(10L))).thenReturn(List.of(trip));
        when(memberRepository.findAllById(List.of(1L))).thenReturn(List.of());
        when(cardTagRepository.findAllByPlanCardIdIn(List.of(20L))).thenReturn(List.of());
        when(tripMemberRepository.findTripIdsByMemberId(2L)).thenReturn(List.of(10L));
        PublicCardService service = new PublicCardService(
                cardRepository, savedRepository, commentRepository, cardTagRepository,
                tagRepository, tripRepository, tripMemberRepository, memberRepository, eventPublisher,
                shareRepository);

        var response = service.getPublicCards(2L, 0, 9, CardSort.LATEST, "");

        assertThat(response.content()).singleElement()
                .satisfies(cardResponse -> {
                    assertThat(cardResponse.ownCard()).isTrue();
                    assertThat(cardResponse.travelStyles()).containsExactly(TravelStyle.FOOD);
                    assertThat(cardResponse.destinationLat()).isEqualTo(37.5665);
                    assertThat(cardResponse.destinationLng()).isEqualTo(126.9780);
                    assertThat(cardResponse.destinationEnglishName()).isEqualTo("Seoul");
                    assertThat(cardResponse.destinationCountryCode()).isEqualTo("KR");
                });
    }

    @Test
    @DisplayName("t4 여행 스타일을 선택하면 해당 스타일의 공개 카드만 반환한다")
    void t4_getPublicCardsFiltersByTravelStyle() {
        PlanCard card = PlanCard.create(10L, "제주 여행", TripVisibility.PUBLIC_ROUTE, 1L);
        ReflectionTestUtils.setField(card, "id", 20L);
        Trip trip = Trip.create(1L, "제주 여행", null, Set.of(TravelStyle.FOOD), "제주", null, null);
        ReflectionTestUtils.setField(trip, "id", 10L);
        when(cardRepository.findAllByVisibilityNot(TripVisibility.PRIVATE)).thenReturn(List.of(card));
        when(tripRepository.findAllById(List.of(10L))).thenReturn(List.of(trip));
        when(memberRepository.findAllById(List.of(1L))).thenReturn(List.of());
        when(cardTagRepository.findAllByPlanCardIdIn(List.of(20L))).thenReturn(List.of());
        PublicCardService service = new PublicCardService(
                cardRepository, savedRepository, commentRepository, cardTagRepository,
                tagRepository, tripRepository, tripMemberRepository, memberRepository, eventPublisher,
                shareRepository);

        var response = service.getPublicCards(
                null, 0, 9, CardSort.LATEST, "", TravelStyle.NATURE);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }

    @Test
    @DisplayName("t5 개인 북마크를 해제하면 여행방에 공유한 기록도 모두 삭제한다")
    void t5_removeBookmarkAlsoRemovesShares() {
        PlanCard card = PlanCard.create(10L, "제주 여행", TripVisibility.PUBLIC_ROUTE, 1L);
        ReflectionTestUtils.setField(card, "id", 20L);
        when(cardRepository.findById(20L)).thenReturn(Optional.of(card));
        PublicCardService service = new PublicCardService(
                cardRepository, savedRepository, commentRepository, cardTagRepository,
                tagRepository, tripRepository, tripMemberRepository, memberRepository, eventPublisher,
                shareRepository);

        service.removeBookmark(2L, 20L);

        then(shareRepository).should().deleteAllByPlanCardIdAndMemberId(20L, 2L);
    }

    @Test
    @DisplayName("t6 북마크 페이지 크기는 최대 100개로 제한한다")
    void t6_bookmarkPageSizeIsLimitedToOneHundred() {
        when(savedRepository.findAllByMemberIdOrderByIdDesc(2L)).thenReturn(List.of());
        PublicCardService service = new PublicCardService(
                cardRepository, savedRepository, commentRepository, cardTagRepository,
                tagRepository, tripRepository, tripMemberRepository, memberRepository, eventPublisher,
                shareRepository);

        var response = service.getBookmarks(2L, 0, 1_000);

        assertThat(response.size()).isEqualTo(100);
        assertThat(response.content()).isEmpty();
    }

    @Test
    @DisplayName("t7 댓글 조회는 데이터베이스 페이지네이션을 사용한다")
    void t7_commentsUseDatabasePagination() {
        PlanCard card = PlanCard.create(10L, "제주 여행", TripVisibility.PUBLIC_ROUTE, 1L);
        ReflectionTestUtils.setField(card, "id", 20L);
        CardComment comment = CardComment.create(20L, 2L, "좋아요");
        when(cardRepository.findById(20L)).thenReturn(Optional.of(card));
        when(commentRepository.findAllByPlanCardIdOrderByCreatedAtAsc(
                org.mockito.ArgumentMatchers.eq(20L), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(comment)));
        when(memberRepository.findAllById(List.of(2L))).thenReturn(List.of());
        PublicCardService service = new PublicCardService(
                cardRepository, savedRepository, commentRepository, cardTagRepository,
                tagRepository, tripRepository, tripMemberRepository, memberRepository, eventPublisher,
                shareRepository);

        var response = service.getComments(20L, 2L, 0, 20);

        assertThat(response.content()).hasSize(1);
        then(commentRepository).should(never())
                .findAllByPlanCardIdOrderByCreatedAtAsc(20L);
    }

    @Test
    @DisplayName("t8 최신 공개 카드 기본 조회는 데이터베이스 페이지네이션을 사용한다")
    void t8_latestPublicCardsUseDatabasePagination() {
        PlanCard card = PlanCard.create(10L, "제주 여행", TripVisibility.PUBLIC_ROUTE, 1L);
        ReflectionTestUtils.setField(card, "id", 20L);
        Trip trip = Trip.create(1L, "제주 여행", null, Set.of(TravelStyle.FOOD), "제주", null, null);
        ReflectionTestUtils.setField(trip, "id", 10L);
        Pageable pageable = PageRequest.of(0, 9);
        when(cardRepository.findAllByVisibilityNotOrderByCreatedAtDesc(
                TripVisibility.PRIVATE, pageable))
                .thenReturn(new PageImpl<>(List.of(card), pageable, 30));
        when(tripRepository.findAllById(List.of(10L))).thenReturn(List.of(trip));
        when(memberRepository.findAllById(List.of(1L))).thenReturn(List.of());
        when(cardTagRepository.findAllByPlanCardIdIn(List.of(20L))).thenReturn(List.of());
        PublicCardService service = new PublicCardService(
                cardRepository, savedRepository, commentRepository, cardTagRepository,
                tagRepository, tripRepository, tripMemberRepository, memberRepository, eventPublisher,
                shareRepository);

        var response = service.getPublicCards(2L, 0, 9, CardSort.LATEST, "");

        assertThat(response.content()).hasSize(1);
        assertThat(response.totalElements()).isEqualTo(30);
        then(cardRepository).should(never()).findAllByVisibilityNot(TripVisibility.PRIVATE);
    }
}
