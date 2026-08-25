package back.backend.domain.card.repository;
import back.backend.domain.card.entity.PlanCard;
import java.util.Optional;
import java.util.List;
import back.backend.domain.trip.entity.TripVisibility;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
public interface PlanCardRepository extends JpaRepository<PlanCard, Long> {
    boolean existsByTripId(Long tripId);
    Optional<PlanCard> findByTripId(Long tripId);
    List<PlanCard> findAllByVisibilityNot(TripVisibility visibility);
    Page<PlanCard> findAllByVisibilityNotOrderByCreatedAtDesc(
            TripVisibility visibility, Pageable pageable);
    List<PlanCard> findAllByTripIdIn(List<Long> tripIds);
}
