import os
import json
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
    - laststatus
    - borocode
    - shape_area
    - shape_leng
    - small_n: small neighborhood
    - large_n: large neighborhood ('central bronx', 'central brooklyn', 'north brooklyn',
        'east brooklyn', 'northwest queens', 'south bronx', 'west bronx',
        'downtown manhattan', 'midtown manhattan', 'south brooklyn',
        'southeast queens', 'north shore staten island',
        'south shore staten island', 'uptown manhattan', 'central queens',
        'east bronx', 'northeast queens', 'way uptown manhattan',
        'mid staten island', 'western queens', 'east shore staten island',
        'rockaways queens', 'special queens')
    - geom
    - built_year
    - ground_ele: Ground elevation
    - heightroof
    - bld_value_2025
    - bld_value_2024
    - avg_prop_value_2025
    - avg_prop_value_2024
    - value_sqft_2025
    - value_sqft_2024
    - gross_sqft
    - res_gross_sqft
    - bld_story
    - zoning
    - bldg_class


"""
OUTPUT_FIELDS = ["column", "neighborhood"]

def make_user_input(query: str) -> list:
    return [
        {
            "role": "system",
            "content": (
                "You translate natural-language questions into fields for the PostgreSQL table 'buildings'. "
                "Return a single-line JSON object with keys:\n"
                "  - column: most relevant column name in 'buildings'\n"
                "  - neighborhood: most relevant neighborhood from 'large_n'\n"
                "If any item cannot be matched, set it to NO_MATCH.\n"
                "Output format example:\n"
                '{"column": "heightroof", "neighborhood": "midtown manhattan"}\n'
                "Do not include code fences or any extra text."
            )
        },
        {
            "role": "user",
            "content": f"Schema:\n{DB_SCHEMA}\n\nQuery: '{query}'"
				}
    ]
    
def get_column_from_query(query: str):
    resp = client.responses.create(
        model="gpt-5-nano",
        input=make_user_input(query),
    )

    raw = resp.output_text.strip()
    print("RAW:", repr(raw))

    try:
        parsed = json.loads(raw)
    except Exception as e:
        print("format error:", e)
        return {
            "column": None,
            "neighborhood": None,
            "usage": None,
            "error": "LLM_OUTPUT_FORMAT_ERROR",
        }

    result = {}
    for key in OUTPUT_FIELDS:
        val = parsed.get(key, "NO_MATCH")
        result[key] = None if val == "NO_MATCH" else val

    usage = resp.usage
    print(
        f"column: {result['column']}, neighborhood: {result['neighborhood']}, "
        f"tokens: {usage.total_tokens}"
    )

    return {
        "column": result["column"],
            "neighborhood": result["neighborhood"],
        "usage": {
            "total": usage.total_tokens,
            "input": usage.input_tokens,
            "output": usage.output_tokens,
        },
        "error": None,
    }