package back.backend.domain.card.service;

import back.backend.domain.card.dto.CardCommentRequest;
import back.backend.domain.card.dto.CardCommentResponse;
import back.backend.domain.card.dto.CardSort;
import back.backend.domain.card.dto.PublicCardPageResponse;
import back.backend.domain.card.dto.PublicCardResponse;
import back.backend.domain.card.entity.CardComment;
import back.backend.domain.card.entity.PlanCard;
import back.backend.domain.card.entity.PlanCardTag;
import back.backend.domain.card.entity.SavedTrip;
import back.backend.domain.card.entity.TripTag;
import back.backend.domain.card.repository.CardCommentRepository;
import back.backend.domain.card.repository.PlanCardRepository;
import back.backend.domain.card.repository.PlanCardTagRepository;
import back.backend.domain.card.repository.SavedTripRepository;
import back.backend.domain.card.repository.TripCardBookmarkShareRepository;
import back.backend.domain.card.repository.TripTagRepository;
import back.backend.domain.member.entity.Member;
import back.backend.domain.member.repository.MemberRepository;
import back.backend.domain.trip.entity.TravelStyle;
import back.backend.domain.trip.entity.Trip;
import back.backend.domain.trip.entity.TripVisibility;
import back.backend.domain.trip.repository.TripMemberRepository;
import back.backend.domain.trip.repository.TripRepository;
import back.backend.global.exception.BusinessException;
import back.backend.global.exception.CommonErrorCode;
import back.backend.global.realtime.RealtimeEvent;
import back.backend.global.response.PageResponse;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class PublicCardService {
    private final PlanCardRepository cardRepository;
    private final SavedTripRepository savedRepository;
    private final CardCommentRepository commentRepository;
    private final PlanCardTagRepository cardTagRepository;
    private final TripTagRepository tagRepository;
    private final TripRepository tripRepository;
    private final TripMemberRepository tripMemberRepository;
    private final MemberRepository memberRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final TripCardBookmarkShareRepository shareRepository;

    public PublicCardService(
            PlanCardRepository cardRepository,
            SavedTripRepository savedRepository,
            CardCommentRepository commentRepository,
            PlanCardTagRepository cardTagRepository,
            TripTagRepository tagRepository,
            TripRepository tripRepository,
            TripMemberRepository tripMemberRepository,
            MemberRepository memberRepository,
            ApplicationEventPublisher eventPublisher,
            TripCardBookmarkShareRepository shareRepository
    ) {
        this.cardRepository = cardRepository;
        this.savedRepository = savedRepository;
        this.commentRepository = commentRepository;
        this.cardTagRepository = cardTagRepository;
        this.tagRepository = tagRepository;
        this.tripRepository = tripRepository;
        this.tripMemberRepository = tripMemberRepository;
        this.memberRepository = memberRepository;
        this.eventPublisher = eventPublisher;
        this.shareRepository = shareRepository;
    }

    public PublicCardPageResponse getPublicCards(
            Long memberId,
            int page,
            int size,
            CardSort sort,
            String query,
            TravelStyle travelStyle
    ) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 50);
        String keyword = query == null ? "" : query.trim().toLowerCase();
        CardSort effectiveSort = sort == null ? CardSort.LATEST : sort;
        if (effectiveSort == CardSort.LATEST && keyword.isEmpty() && travelStyle == null) {
            Page<PlanCard> cardPage = cardRepository
                    .findAllByVisibilityNotOrderByCreatedAtDesc(
                            TripVisibility.PRIVATE, PageRequest.of(safePage, safeSize));
            return new PublicCardPageResponse(
                    toResponses(cardPage.getContent(), memberId),
                    safePage,
                    safeSize,
                    cardPage.getTotalElements(),
                    cardPage.getTotalPages());
        }
        List<PublicCardResponse> cards = toResponses(
                cardRepository.findAllByVisibilityNot(TripVisibility.PRIVATE), memberId).stream()
                .filter(card -> travelStyle == null || card.travelStyles().contains(travelStyle))
                .filter(card -> keyword.isEmpty() || matches(card, keyword))
                .sorted(comparator(effectiveSort))
                .toList();
        int from = Math.min(safePage * safeSize, cards.size());
        int to = Math.min(from + safeSize, cards.size());
        return new PublicCardPageResponse(
                cards.subList(from, to), safePage, safeSize, cards.size(),
                (int) Math.ceil((double) cards.size() / safeSize));
    }

    public PublicCardPageResponse getPublicCards(
            Long memberId, int page, int size, CardSort sort, String query) {
        return getPublicCards(memberId, page, size, sort, query, null);
    }

    public List<PublicCardResponse> getBookmarks(Long memberId) {
        List<Long> orderedTripIds = savedRepository.findAllByMemberIdOrderByIdDesc(memberId)
                .stream().map(SavedTrip::getTripId).toList();
        if (orderedTripIds.isEmpty()) return List.of();
        Map<Long, PlanCard> cardsByTripId = cardRepository.findAllByTripIdIn(orderedTripIds).stream()
                .filter(card -> card.getVisibility() != TripVisibility.PRIVATE)
                .collect(Collectors.toMap(PlanCard::getTripId, Function.identity()));
        List<PlanCard> orderedCards = orderedTripIds.stream()
                .map(cardsByTripId::get)
                .filter(Objects::nonNull)
                .toList();
        return toResponses(orderedCards, memberId);
    }

    public PageResponse<PublicCardResponse> getBookmarks(Long memberId, int page, int size) {
        return paginate(getBookmarks(memberId), page, size);
    }

    public PublicCardResponse getPublicCard(Long cardId, Long memberId) {
        return toResponses(List.of(requirePublic(cardId)), memberId).getFirst();
    }

    public Map<Long, PublicCardResponse> getPublicCards(
            Collection<Long> cardIds, Long memberId) {
        List<PlanCard> cards = cardRepository.findAllById(cardIds).stream()
                .filter(card -> card.getVisibility() != TripVisibility.PRIVATE)
                .toList();
        return toResponses(cards, memberId).stream()
                .collect(Collectors.toMap(PublicCardResponse::id, Function.identity()));
    }

    @Transactional
    public void bookmark(Long memberId, Long cardId) {
        PlanCard card = requirePublic(cardId);
        if (isOwnCard(card, memberId)) throw new BusinessException(CommonErrorCode.FORBIDDEN);
        if (savedRepository.findByMemberIdAndTripId(memberId, card.getTripId()).isEmpty()) {
            savedRepository.save(SavedTrip.create(memberId, card.getTripId()));
            eventPublisher.publishEvent(RealtimeEvent.publicCard(cardId));
        }
    }

    @Transactional
    public void removeBookmark(Long memberId, Long cardId) {
        PlanCard card = requirePublic(cardId);
        savedRepository.findByMemberIdAndTripId(memberId, card.getTripId())
                .ifPresent(savedRepository::delete);
        shareRepository.deleteAllByPlanCardIdAndMemberId(cardId, memberId);
        eventPublisher.publishEvent(RealtimeEvent.publicCard(cardId));
    }

    public PageResponse<CardCommentResponse> getComments(
            Long cardId, Long memberId, int page, int size) {
        requirePublic(cardId);
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 100);
        Page<CardComment> comments = commentRepository
                .findAllByPlanCardIdOrderByCreatedAtAsc(
                        cardId, PageRequest.of(safePage, safeSize));
        Map<Long, String> nicknames = memberRepository.findAllById(comments.stream()
                        .map(CardComment::getMemberId).distinct().toList()).stream()
                .collect(Collectors.toMap(Member::getId, Member::getNickname));
        return PageResponse.from(comments.map(
                comment -> toComment(comment, memberId, nicknames)));
    }

    @Transactional
    public CardCommentResponse addComment(
            Long memberId, Long cardId, CardCommentRequest request) {
        requirePublic(cardId);
        CardComment comment = commentRepository.save(
                CardComment.create(cardId, memberId, request.content()));
        CardCommentResponse response = toComment(comment, memberId);
        eventPublisher.publishEvent(RealtimeEvent.publicCard(cardId));
        return response;
    }

    @Transactional
    public void deleteComment(Long memberId, Long cardId, Long commentId) {
        requirePublic(cardId);
        CardComment comment = commentRepository.findByIdAndMemberId(commentId, memberId)
                .filter(item -> item.getPlanCardId().equals(cardId))
                .orElseThrow(() -> new BusinessException(CommonErrorCode.NOT_FOUND));
        commentRepository.delete(comment);
        eventPublisher.publishEvent(RealtimeEvent.publicCard(cardId));
    }

    private PlanCard requirePublic(Long cardId) {
        return cardRepository.findById(cardId)
                .filter(card -> card.getVisibility() != TripVisibility.PRIVATE)
                .orElseThrow(() -> new BusinessException(CommonErrorCode.NOT_FOUND));
    }

    private boolean matches(PublicCardResponse card, String keyword) {
        return card.title().toLowerCase().contains(keyword)
                || card.authorNickname().toLowerCase().contains(keyword)
                || card.tags().stream().anyMatch(tag -> tag.toLowerCase().contains(keyword));
    }

    private Comparator<PublicCardResponse> comparator(CardSort sort) {
        return switch (sort == null ? CardSort.LATEST : sort) {
            case POPULAR -> Comparator.comparingLong(PublicCardResponse::bookmarkCount).reversed()
                    .thenComparing(PublicCardResponse::createdAt, Comparator.reverseOrder());
            case COMMENTS -> Comparator.comparingLong(PublicCardResponse::commentCount).reversed()
                    .thenComparing(PublicCardResponse::createdAt, Comparator.reverseOrder());
            case LATEST -> Comparator.comparing(
                    PublicCardResponse::createdAt, Comparator.reverseOrder());
        };
    }

    private List<PublicCardResponse> toResponses(List<PlanCard> cards, Long memberId) {
        if (cards.isEmpty()) return List.of();
        ResponseContext context = responseContext(cards, memberId);
        return cards.stream().map(card -> toResponse(card, memberId, context)).toList();
    }

    private PublicCardResponse toResponse(
            PlanCard card, Long memberId, ResponseContext context) {
        Trip trip = Optional.ofNullable(context.trips().get(card.getTripId()))
                .orElseThrow(() -> new BusinessException(CommonErrorCode.NOT_FOUND));
        boolean ownCard = memberId != null && (card.getCreatedBy().equals(memberId)
                || context.ownedTripIds().contains(card.getTripId()));
        boolean bookmarked = memberId != null && !ownCard
                && context.bookmarkedTripIds().contains(card.getTripId());
        return new PublicCardResponse(
                card.getId(), card.getTripId(), card.getCreatedBy(),
                context.nicknames().getOrDefault(card.getCreatedBy(), "알 수 없음"),
                card.getTitle(), card.getSummary(), trip.getDestination(),
                trip.getDestinationLat(), trip.getDestinationLng(),
                trip.getDestinationEnglishName(), trip.getDestinationCountryCode(),
                card.getCoverImageUrl() != null ? card.getCoverImageUrl() : trip.getCoverImageUrl(),
                trip.getTravelStyles(),
                context.tagNamesByCard().getOrDefault(card.getId(), List.of()),
                context.bookmarkCounts().getOrDefault(card.getTripId(), 0L),
                context.commentCounts().getOrDefault(card.getId(), 0L),
                bookmarked, ownCard, card.getCreatedAt());
    }

    private ResponseContext responseContext(List<PlanCard> cards, Long memberId) {
        List<Long> tripIds = cards.stream().map(PlanCard::getTripId).distinct().toList();
        List<Long> cardIds = cards.stream().map(PlanCard::getId).distinct().toList();
        List<Long> authorIds = cards.stream().map(PlanCard::getCreatedBy).distinct().toList();
        Map<Long, Trip> trips = tripRepository.findAllById(tripIds).stream()
                .collect(Collectors.toMap(Trip::getId, Function.identity()));
        Map<Long, String> nicknames = memberRepository.findAllById(authorIds).stream()
                .collect(Collectors.toMap(Member::getId, Member::getNickname));
        List<PlanCardTag> cardTags = cardTagRepository.findAllByPlanCardIdIn(cardIds);
        Map<Long, String> tagNames = tagRepository.findAllById(cardTags.stream()
                        .map(PlanCardTag::getTagId).distinct().toList()).stream()
                .collect(Collectors.toMap(TripTag::getId, TripTag::getName));
        Map<Long, List<String>> tagNamesByCard = cardTags.stream()
                .filter(cardTag -> tagNames.containsKey(cardTag.getTagId()))
                .collect(Collectors.groupingBy(
                        PlanCardTag::getPlanCardId,
                        Collectors.mapping(
                                cardTag -> tagNames.get(cardTag.getTagId()), Collectors.toList())));
        Map<Long, Long> bookmarkCounts = savedRepository.countAllByTripIds(tripIds).stream()
                .collect(Collectors.toMap(
                        SavedTripRepository.TripCount::getTripId,
                        SavedTripRepository.TripCount::getTotal));
        Map<Long, Long> commentCounts = commentRepository.countAllByPlanCardIds(cardIds).stream()
                .collect(Collectors.toMap(
                        CardCommentRepository.CardCount::getPlanCardId,
                        CardCommentRepository.CardCount::getTotal));
        Set<Long> bookmarkedTripIds = memberId == null ? Set.of() : savedRepository
                .findAllByMemberIdOrderByIdDesc(memberId).stream()
                .map(SavedTrip::getTripId).collect(Collectors.toSet());
        Set<Long> ownedTripIds = memberId == null ? Set.of()
                : new HashSet<>(tripMemberRepository.findTripIdsByMemberId(memberId));
        return new ResponseContext(
                trips, nicknames, tagNamesByCard, bookmarkCounts, commentCounts,
                bookmarkedTripIds, ownedTripIds);
    }

    private boolean isOwnCard(PlanCard card, Long memberId) {
        return memberId != null && (card.getCreatedBy().equals(memberId)
                || tripMemberRepository.existsByTripIdAndMemberId(card.getTripId(), memberId));
    }

    private CardCommentResponse toComment(CardComment comment, Long memberId) {
        Map<Long, String> nickname = memberRepository.findById(comment.getMemberId())
                .map(member -> Map.of(member.getId(), member.getNickname()))
                .orElse(Map.of());
        return toComment(comment, memberId, nickname);
    }

    private CardCommentResponse toComment(
            CardComment comment, Long memberId, Map<Long, String> nicknames) {
        return new CardCommentResponse(
                comment.getId(), comment.getMemberId(),
                nicknames.getOrDefault(comment.getMemberId(), "알 수 없음"),
                comment.getContent(), memberId != null && memberId.equals(comment.getMemberId()),
                comment.getCreatedAt());
    }

    private <T> PageResponse<T> paginate(List<T> items, int requestedPage, int requestedSize) {
        int page = Math.max(requestedPage, 0);
        int size = Math.min(Math.max(requestedSize, 1), 100);
        int from = Math.min(page * size, items.size());
        int to = Math.min(from + size, items.size());
        int totalPages = (int) Math.ceil((double) items.size() / size);
        return new PageResponse<>(
                items.subList(from, to), page, size, items.size(), totalPages,
                page == 0, page + 1 >= totalPages, items.isEmpty());
    }

    private record ResponseContext(
            Map<Long, Trip> trips,
            Map<Long, String> nicknames,
            Map<Long, List<String>> tagNamesByCard,
            Map<Long, Long> bookmarkCounts,
            Map<Long, Long> commentCounts,
            Set<Long> bookmarkedTripIds,
            Set<Long> ownedTripIds
    ) {
    }
}
