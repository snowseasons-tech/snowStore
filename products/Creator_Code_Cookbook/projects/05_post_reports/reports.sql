-- Run after setup. These SELECT statements do not change data.
-- JOIN adds readable channel names to post rows.
SELECT p.post_id, c.name AS channel, p.title, p.views
FROM posts AS p JOIN channels AS c ON c.channel_id = p.channel_id
ORDER BY p.post_id;

-- LEFT JOIN keeps channels with no published posts. The status filter belongs in ON.
-- COUNT(p.post_id) counts actual matches; COUNT(*) would also count an empty match.
SELECT c.name, COUNT(p.post_id) AS published_posts,
       COALESCE(SUM(p.views), 0) AS total_views
FROM channels AS c LEFT JOIN posts AS p
    ON p.channel_id = c.channel_id AND p.status = 'published'
GROUP BY c.channel_id, c.name
ORDER BY c.channel_id;

-- Force decimal division with 100.0. NULLIF prevents division by zero.
-- This teaching formula is not an official platform metric.
SELECT title, ROUND(100.0 * (likes + comments + saves) / NULLIF(views, 0), 2)
    AS actions_per_view_percent
FROM posts ORDER BY post_id;
