import asyncio,logging
from datetime import timedelta
from sqlalchemy import select
from .db import Session,Post,Connection,now,init_db
from .integrations import publish
logging.basicConfig(level=logging.INFO)
logger=logging.getLogger(__name__)

STUCK_AFTER=timedelta(minutes=10)

def recover_stuck(db):
    # A post left in 'publishing' means a worker stopped mid-publish. It may or may not have gone out,
    # so mark it failed for a person to check rather than retrying and risking a duplicate.
    stuck=db.scalars(select(Post).where(Post.status=='publishing',Post.updated_at<=now()-STUCK_AFTER).with_for_update(skip_locked=True)).all()
    for post in stuck:
        post.status='failed';post.last_error='Publishing was interrupted. Check the platform to see whether it went out before editing and resubmitting.'
        logger.warning('Post %s was stuck in publishing; marked failed',post.id)
    db.commit()

async def run_once():
    with Session() as db: recover_stuck(db)
    # Atomic row lock prevents duplicate work across worker replicas.
    with Session() as db:
        posts=db.scalars(select(Post).where(Post.status=='scheduled',Post.scheduled_at<=now()).order_by(Post.scheduled_at).with_for_update(skip_locked=True).limit(10)).all()
        for post in posts:
            post.status='publishing'
        ids=[p.id for p in posts]
        db.commit()
    for pid in ids:
        with Session() as db:
            post=db.get(Post,pid)
            if not post: continue
            conn=db.get(Connection,post.connection_id) if post.connection_id else None
            if not conn or conn.client_id!=post.client_id or conn.platform!=post.platform:
                post.status='failed';post.last_error='Disconnected or mismatched account';db.commit();continue
            try:
                external_id=await publish(post,conn)
                post.external_post_id=external_id
                post.status='published';post.last_error=''
                logger.info('Published post %s on %s',post.id,post.platform)
            except Exception as e:
                # Deliberately no automatic retry: publishing can be non-idempotent.
                post.status='failed';post.last_error=str(e)[:1000]
                logger.error('Failed post %s: %s',post.id,e)
            db.commit()

async def main():
    init_db()
    while True:
        try: await run_once()
        except Exception: logger.exception('Worker cycle failed')
        await asyncio.sleep(15)
if __name__=='__main__': asyncio.run(main())
