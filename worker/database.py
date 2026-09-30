"""Owner-scoped durable job state and exclusive, expiring worker leases in Neon."""
import json
import os
import time
import uuid
import psycopg
from psycopg.rows import dict_row
from worker.security import redact_data


def connect():
    return psycopg.connect(os.environ["DATABASE_URL"],autocommit=True,row_factory=dict_row,connect_timeout=15)


def claim():
    lease=str(uuid.uuid4())
    with connect() as db:
        return db.execute("SELECT * FROM patchgoblin_claim(%s::uuid)",(lease,)).fetchone()


class DatabaseStore:
    def __init__(self,row):
        self.id,self.lease=row["id"],row["lease_token"]
        self.previous=row["state"] or None
        self.last_check=0
        self.is_cancelled=False

    def save(self,state):
        text=json.dumps(redact_data(state),ensure_ascii=False)
        if len(text.encode())>250000:
            raise ValueError("Job state exceeds the durable storage budget")
        with connect() as db:
            updated=db.execute("UPDATE patchgoblin_jobs SET state=%s::jsonb,status=%s,updated_at=now() WHERE id=%s AND lease_token=%s AND lease_expires_at>now() AND (cancelled_at IS NULL OR %s='cancelled') RETURNING id",(text,state["status"],self.id,self.lease,state['status'])).fetchone()
            if not updated and not self.cancelled(force=True):
                raise InterruptedError("Worker no longer owns this job lease")

    def cancelled(self,force=False):
        if force or time.monotonic()-self.last_check>2:
            self.last_check=time.monotonic()
            with connect() as db:
                row=db.execute("SELECT cancelled_at,lease_token,lease_expires_at>now() AS valid FROM patchgoblin_jobs WHERE id=%s",(self.id,)).fetchone()
            self.is_cancelled=not row or bool(row["cancelled_at"]) or row["lease_token"]!=self.lease or not row["valid"]
        return self.is_cancelled

    def sandbox(self,sandbox_id):
        with connect() as db:
            db.execute("UPDATE patchgoblin_jobs SET sandbox_id=%s WHERE id=%s AND lease_token=%s",(sandbox_id,self.id,self.lease))

    def release(self):
        with connect() as db:
            db.execute("UPDATE patchgoblin_jobs SET lease_token=NULL,lease_expires_at=NULL WHERE id=%s AND lease_token=%s",(self.id,self.lease))
