"""FastAPI routers, one module per resource. Every route is firm-scoped — see
app/api/deps.py's get_case_scoped/get_current_user for the tenancy pattern every
handler in this package is expected to use."""
