"""Apply the additive product schema through the existing pooled Neon connection."""
import os
from pathlib import Path
import psycopg
for line in Path('.local/neon.env').read_text().splitlines():
    if line.startswith('DATABASE_URL='):os.environ['DATABASE_URL']=line.split('=',1)[1]
with psycopg.connect(os.environ['DATABASE_URL']) as connection:
    for migration in ['002_product.sql', '003_guardrails.sql']:
        connection.execute(Path('db', migration).read_text())
print('Additive product schema installed; existing job rows preserved.')
