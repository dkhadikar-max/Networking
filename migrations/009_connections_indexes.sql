-- The connections table had zero indexes despite being queried on essentially
-- every chat-list/message-count/conversation-detail request via
-- .from('connections').select('*').or(`user1.eq.${id},user2.eq.${id}`)
-- (server.js, GET /api/connections and GET /api/connections/:connId).
-- Every other high-traffic table (messages, circle_posts, notifications)
-- already has indexes; this one was missed. Safe to run any time — additive
-- only, no data changes.

CREATE INDEX IF NOT EXISTS idx_connections_user1 ON connections (user1);
CREATE INDEX IF NOT EXISTS idx_connections_user2 ON connections (user2);
