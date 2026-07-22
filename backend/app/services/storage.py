"""S3-compatible object storage (MinIO locally, S3 in prod). boto3 has no native asyncio
support, so calls run via asyncio.to_thread rather than pulling in a second S3 client library.
Keys are firm-namespaced; callers only ever get short-lived presigned URLs (plan §10)."""

import asyncio
import uuid

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import get_settings

settings = get_settings()

_client = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint_url,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
    config=BotoConfig(signature_version="s3v4"),
)

# SigV4 signs the host, so a presigned URL must be generated against the host it'll actually
# be fetched from — a separate client for the public endpoint, not a string-replace after
# signing (which would invalidate the signature).
_presign_client = boto3.client(
    "s3",
    endpoint_url=settings.s3_public_endpoint_url or settings.s3_endpoint_url,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
    config=BotoConfig(signature_version="s3v4"),
)


def build_key(firm_id: uuid.UUID, case_id: uuid.UUID, filename: str) -> str:
    return f"{firm_id}/{case_id}/{uuid.uuid4()}-{filename}"


def _ensure_bucket_sync() -> None:
    try:
        _client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        try:
            _client.create_bucket(Bucket=settings.s3_bucket)
        except ClientError as exc:
            # Multiple uvicorn workers can race here at boot; "already owned/exists" from the
            # loser of the race is expected, not an error.
            code = exc.response.get("Error", {}).get("Code", "")
            if code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                raise

    # Versioning on (plan §11): an accidental overwrite/delete of an exhibit is recoverable.
    # put_bucket_versioning is idempotent — safe to call on every boot, including the race
    # above where multiple workers reach this line concurrently.
    _client.put_bucket_versioning(Bucket=settings.s3_bucket, VersioningConfiguration={"Status": "Enabled"})


async def ensure_bucket() -> None:
    await asyncio.to_thread(_ensure_bucket_sync)


async def upload_bytes(key: str, data: bytes, content_type: str) -> None:
    await asyncio.to_thread(
        _client.put_object, Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type
    )


async def presigned_url(key: str, expires_in: int = 3600) -> str:
    return await asyncio.to_thread(
        _presign_client.generate_presigned_url,
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )


async def get_bytes(key: str) -> bytes:
    def _get() -> bytes:
        obj = _client.get_object(Bucket=settings.s3_bucket, Key=key)
        return obj["Body"].read()

    return await asyncio.to_thread(_get)
