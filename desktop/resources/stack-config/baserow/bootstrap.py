"""Initialize original Baserow schema and singleton before concurrent workers.

The original PasswordProviderHandler.get uses get_or_create without a unique
constraint. On an empty database concurrent health checks can create duplicates.
No existing provider is deleted or changed; inconsistent existing data block boot.
"""
from django.core.management import call_command
from django.db import connection, transaction
from baserow.core.auth_provider.handler import PasswordProviderHandler
from baserow.core.auth_provider.models import PasswordAuthProviderModel

call_command("migrate", interactive=False)
with transaction.atomic():
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL statement_timeout = '30s'")
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [717541021])
    if PasswordAuthProviderModel.objects.count() > 1:
        raise RuntimeError(
            "Multiple original password providers exist; preserve data and repair "
            "explicitly before starting Baserow. No provider was removed."
        )
    PasswordProviderHandler.get()
print("Original Baserow schema and password provider initialized")
