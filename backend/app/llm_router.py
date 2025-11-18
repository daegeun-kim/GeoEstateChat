import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(dotenv_path="../.env")
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

DB_SCHEMA = """
Database: PostgreSQL 16 with PostGIS

Tables:
- buildings
    - bin: building id number
    - base_bbl
    - mapp_bbl
    - doitt_id
    - feat_code
    - laststatus
    - borocode
    - shape_area
    - shape_leng
    - geom
    - built_year
    - ground_ele: Ground elevation
    - heightroof
    - small_n: small neighborhood
    - small_n_a: small neighborhood abbreviation
"""

def make_user_input(query: str) -> list:
    return [
        {
            "role": "system",
            "content": (
                "You translate natural-language questions into the most relevant "
                "column in the PostgreSQL table 'buildings'. "
                "If the query does not correspond to any column, output exactly: NO_MATCH."
            )
        },
        {
            "role": "user",
            "content": f"Schema:\n{DB_SCHEMA}\n\nTask:provide exactly one word output: the column name based on the query'{query}'"
				}
    ]

def get_column_from_query(query: str):
    resp = client.responses.create(
        model="gpt-5-nano",
        input=make_user_input(query)
    )

    raw = resp.output_text.strip()
    if raw == "NO_MATCH":
        column = "there is no appropriate data for your query"
        print("no appropriate column")
    else:
        column = raw

    usage = resp.usage
    print(f"column found: {column}, token: {usage.total_tokens}")
    return {
        "column": column,
        "usage": {
            "total": usage.total_tokens,
            "input": usage.input_tokens,
            "output": usage.output_tokens
        }
    }