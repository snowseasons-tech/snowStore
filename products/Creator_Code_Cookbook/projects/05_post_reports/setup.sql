-- Use a NEW SQLite practice file. Setup never deletes earlier tables.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
-- A channel is a fictional creative series, not a connected social account.
CREATE TABLE channels (
    channel_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE posts (
    post_id INTEGER PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(channel_id),
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
    views INTEGER NOT NULL CHECK(typeof(views) = 'integer' AND views >= 0),
    likes INTEGER NOT NULL CHECK(typeof(likes) = 'integer' AND likes >= 0),
    comments INTEGER NOT NULL CHECK(typeof(comments) = 'integer' AND comments >= 0),
    saves INTEGER NOT NULL CHECK(typeof(saves) = 'integer' AND saves >= 0)
);
INSERT INTO channels VALUES (1, 'Studio Notes'), (2, 'Weekend Lens'), (3, 'Game Sketches');
INSERT INTO posts VALUES
    (101, 1, 'Desk setup tour', 'published', 1000, 80, 10, 20),
    (102, 1, 'Sketch timelapse', 'published', 500, 60, 5, 15),
    (103, 2, 'Photo walk', 'draft', 0, 0, 0, 0);
COMMIT;
