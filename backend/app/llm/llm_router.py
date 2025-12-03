import os
import json
from openai import OpenAI
from dotenv import load_dotenv
from .llm_prompt import DB_SCHEMA_analyze

load_dotenv(dotenv_path="../.env")
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)



def select_mode(query: str) -> list:
    return [
        {
            "role": "system",
            "content": (
                "Classify into: analyze, search, compare. "
                "analyze: user specifies a neighborhood-scale region (any sub-borough area, even if name is not exact). "
                "search: user mentions only borough or city-level area, or gives no region. "
                "compare: user mentions two distinct regions. "
                "Return JSON only: {\"mode\":\"...\"}."
            )
        },
        {"role": "user", "content": query}
    ]


def build_analyze_plan(query: str) -> list:
    return [
        {
            "role": "system",
            "content": (
                "Map the query to PostgreSQL tables buildings and street_block. "
                "Return JSON: {\"column\",\"dtype\",\"scale\",\"region\",\"table\",\"filters\"}. "
                "dtype ∈ [\"numeric\",\"categorical\",\"boolean\"], based on DB_SCHEMA. "
                "scale ∈ [\"city\",\"borough\",\"large_n\"]. "
                "If scale=\"city\": region=null and no region filter. "
                "If scale=\"borough\": region is borocode (int) and filters must include [\"borocode\",\"=\",region]. "
                "If scale=\"large_n\": region is large_n (str) and filters must include [\"large_n\",\"=\",region]. "
                "table=\"street_block\" when scale in [\"city\",\"borough\"], else \"buildings\". "
                "column must exist in the chosen table and match its dtype. "
                "filters is a list of [column, op, value], using only columns from the chosen table. "
                "Use \"NO_MATCH\" when unsure. "
                "Respond with JSON only."
            ),
        },
        {
            "role": "user",
            "content": f"Schema:\n{DB_SCHEMA_analyze}\n\nQuery:\n{query}",
        },
    ]
