"""Business logic that isn't a route handler or a graph node: storage (S3/MinIO), the
audit log writer, health/risk scoring, structured logging config, and the LLM router.
Routers and agent nodes both call into this layer rather than duplicating logic."""
