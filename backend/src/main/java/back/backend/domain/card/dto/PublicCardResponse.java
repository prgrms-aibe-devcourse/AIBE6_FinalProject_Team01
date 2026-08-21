package back.backend.domain.card.dto;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import back.backend.domain.trip.entity.TravelStyle;
public record PublicCardResponse(
        Long id, Long tripId, Long authorId, String authorNickname, String title,
        String summary, String destination, Double destinationLat,
        Double destinationLng, String destinationEnglishName,
        String destinationCountryCode, String coverImageUrl,
        Set<TravelStyle> travelStyles, List<String> tags,
        long bookmarkCount, long commentCount, boolean bookmarked, boolean ownCard,
        LocalDateTime createdAt
) {}
