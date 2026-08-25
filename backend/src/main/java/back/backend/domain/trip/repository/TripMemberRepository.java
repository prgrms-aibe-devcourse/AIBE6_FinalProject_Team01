package back.backend.domain.trip.repository;

import back.backend.domain.trip.entity.TripMember;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TripMemberRepository extends JpaRepository<TripMember, Long> {
    void deleteAllByTripId(Long tripId);

    void deleteByTripIdAndMemberId(Long tripId, Long memberId);

    boolean existsByTripIdAndMemberId(Long tripId, Long memberId);

    long countByTripId(Long tripId);

    @Query("select tm.tripId as tripId, count(tm.id) as memberCount "
            + "from TripMember tm where tm.tripId in :tripIds group by tm.tripId")
    List<TripMemberCount> countAllByTripIds(@Param("tripIds") List<Long> tripIds);

    @Query("select tm.memberId from TripMember tm where tm.tripId = :tripId")
    List<Long> findMemberIdsByTripId(Long tripId);

    @Query("select tm.tripId from TripMember tm where tm.memberId = :memberId")
    List<Long> findTripIdsByMemberId(Long memberId);

    interface TripMemberCount {
        Long getTripId();
        long getMemberCount();
    }
}
