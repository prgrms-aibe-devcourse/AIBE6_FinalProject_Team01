CREATE INDEX idx_notifications_member_created_id
    ON notifications (member_id, created_at DESC, id DESC);

CREATE INDEX idx_notifications_member_read
    ON notifications (member_id, is_read);

CREATE INDEX idx_plan_cards_visibility_created
    ON plan_cards (visibility, created_at DESC);
