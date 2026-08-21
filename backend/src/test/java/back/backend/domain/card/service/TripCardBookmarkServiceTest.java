package back.backend.domain.card.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

import back.backend.domain.card.dto.PublicCardResponse;
import back.backend.domain.card.entity.TripCardBookmarkShare;
import back.backend.domain.card.repository.TripCardBookmarkShareRepository;
import back.backend.domain.member.entity.Member;
import back.backend.domain.member.repository.MemberRepository;
import back.backend.domain.place.service.TripAccessChecker;
import back.backend.global.security.SecurityContextAccessor;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Page;

@ExtendWith(MockitoExtension.class)
class TripCardBookmarkServiceTest {
    @Mock TripCardBookmarkShareRepository repository;
    @Mock PublicCardService publicCardService;
    @Mock MemberRepository memberRepository;
    @Mock TripAccessChecker accessChecker;
    @Mock SecurityContextAccessor security;

    @Test
    @DisplayName("t1 같은 사용자가 이미 공유한 카드는 중복 저장하지 않는다")
    void t1_duplicateShareIsIdempotent() {
        var service = service();
        given(security.getCurrentMemberId()).willReturn(3L);
        given(repository.existsByTripIdAndPlanCardIdAndMemberId(1L, 2L, 3L)).willReturn(true);

        service.share(1L, 2L);

        then(repository).should(org.mockito.Mockito.never()).saveAndFlush(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("t2 여러 사용자가 같은 카드를 공유하면 카드 하나와 공유자 목록을 반환한다")
    void t2_sameCardSharesAreGroupedWithSharers() {
        var service = service();
        given(security.getCurrentMemberId()).willReturn(3L);
        given(repository.findDistinctPlanCardIdsByTripId(1L, PageRequest.of(0, 20)))
                .willReturn(new PageImpl<>(List.of(2L), PageRequest.of(0, 20), 1));
        given(repository.findAllByTripIdAndPlanCardIdIn(1L, List.of(2L))).willReturn(List.of(
                TripCardBookmarkShare.create(1L, 2L, 3L),
                TripCardBookmarkShare.create(1L, 2L, 4L)));
        given(publicCardService.getPublicCards(Set.of(2L), 3L)).willReturn(Map.of(2L, card()));
        Member first = org.mockito.Mockito.mock(Member.class);
        Member second = org.mockito.Mockito.mock(Member.class);
        given(first.getId()).willReturn(3L);
        given(first.getNickname()).willReturn("민수");
        given(second.getId()).willReturn(4L);
        given(second.getNickname()).willReturn("영희");
        given(memberRepository.findAllById(Set.of(3L, 4L))).willReturn(List.of(first, second));

        var result = service.getShared(1L, 0, 20).content();

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().sharerNicknames()).containsExactly("민수", "영희");
        assertThat(result.getFirst().sharedByMe()).isTrue();
    }

    @Test
    @DisplayName("t3 공유 해제는 현재 사용자의 공유 기록만 삭제한다")
    void t3_unshareDeletesOnlyCurrentMembersShare() {
        var service = service();
        given(security.getCurrentMemberId()).willReturn(3L);

        service.unshare(1L, 2L);

        then(accessChecker).should().requireView(1L);
        then(repository).should()
                .deleteByTripIdAndPlanCardIdAndMemberId(1L, 2L, 3L);
    }

    @Test
    @DisplayName("t4 공유 북마크 페이지 크기는 최대 100개로 제한한다")
    void t4_sharedBookmarkPageSizeIsLimitedToOneHundred() {
        var service = service();
        given(security.getCurrentMemberId()).willReturn(3L);
        given(repository.findDistinctPlanCardIdsByTripId(
                1L, PageRequest.of(0, 100))).willReturn(Page.empty(PageRequest.of(0, 100)));

        var result = service.getShared(1L, 0, 1_000);

        assertThat(result.size()).isEqualTo(100);
        assertThat(result.content()).isEmpty();
    }

    @Test
    @DisplayName("t5 공유 북마크는 중복 제거된 카드 기준으로 DB 페이지 조회한다")
    void t5_sharedBookmarksArePagedByDistinctCardInDatabase() {
        var service = service();
        var pageable = PageRequest.of(1, 2);
        given(security.getCurrentMemberId()).willReturn(3L);
        given(repository.findDistinctPlanCardIdsByTripId(1L, pageable))
                .willReturn(new PageImpl<>(List.of(7L, 8L), pageable, 5));
        given(repository.findAllByTripIdAndPlanCardIdIn(1L, List.of(7L, 8L)))
                .willReturn(List.of());

        var result = service.getShared(1L, 1, 2);

        assertThat(result.page()).isEqualTo(1);
        assertThat(result.totalElements()).isEqualTo(5);
        then(repository).should().findDistinctPlanCardIdsByTripId(1L, pageable);
        then(repository).should().findAllByTripIdAndPlanCardIdIn(1L, List.of(7L, 8L));
    }

    private TripCardBookmarkService service() {
        return new TripCardBookmarkService(repository, publicCardService, memberRepository, accessChecker, security);
    }

    private PublicCardResponse card() {
        return new PublicCardResponse(2L, 5L, 6L, "작성자", "제주", null, "제주",
                null, null, null, null, null,
                Set.of(), List.of(), 1, 0, true, false, LocalDateTime.now());
    }
}
