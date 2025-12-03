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
                "You map a natural language query to a structured analysis plan.\n"
                "\n"
                "Return JSON only, with exactly these keys:\n"
                "{"
                "\"column\":\"...\","
                "\"dtype\":\"numeric|categorical|boolean\","
                "\"scale\":\"city|borough|large_n\","
                "\"region\": null|int|string,"
                "\"table\":\"street_block|buildings\","
                "\"filters\":[[\"col\",\"op\",\"value\"], ...]"
                "}\n"
                "\n"
                "Rules:\n"
                "- column should be the most relevant column based on the query(must exist in the chosen table and match dtype.)\n"
                "- dtype is inferred from DB_SCHEMA.\n"
                "- scale = \"large_n\" if a value of large_n can be specified.\n"
                "- If scale = \"city\": region = null, filters should not include borocode or large_n.\n"
                "- If scale = \"borough\":\n"
                "  region is borocode (int, 1-5) and filters must include [\"borocode\", \"=\", region], does not include [\"large_n\", \"=\", region].\n"
                "- If scale = \"large_n\":\n"
                "  region is large_n (string) and filters must include [\"large_n\", \"=\", region].\n"
                "- table = \"street_block\" when scale in [\"city\",\"borough\"],\n"
                "  table = \"buildings\" when scale = \"large_n\".\n"
                "- filters is a list of [column, op, value] using only columns from the chosen table.\n"
                "- Allowed ops in filters: \"=\", \">\", \"<\", \">=\", \"<=\".\n"
                "- Never use id/grouping-only fields (geom, internal ids) as column.\n"
                "- If unsure, set column = \"NO_MATCH\".\n"
                "\n"
                "Examples (format only, not tied to the schema):\n"
                "Query: \"in Midtown Manhattan, show buildings above 100m\"\n"
                "→ {\"column\":\"heightroof\",\"dtype\":\"numeric\",\"scale\":\"large_n\",\"region\":\"midtown manhattan\","
                "\"table\":\"buildings\",\"filters\":[[\"large_n\",\"=\",\"midtown manhattan\"],[\"heightroof\",\">\",\"328.084\"]]}\n"
                "\n"
                "Respond with JSON only, no extra text."
            ),
        },
        {
            "role": "user",
            "content": f"Schema:\n{DB_SCHEMA_analyze}\n\nQuery:\n{query}",
        },
    ]


def build_search_plan(query: str) -> list:
    return [
        {
            "role": "system",
            "content": (
                "Map the query to two columns:\n"
                "- column_s: from street_block\n"
                "- column_b: from buildings\n"
                "Both must represent the SAME variable (height, value, density, etc.).\n"
                "\n"
                "Allowed output JSON:\n"
                "{"
                "\"column_s\":\"...\","
                "\"column_b\":\"...\","
                "\"dtype\":\"numeric|categorical|boolean\","
                "\"scale\":\"borough|large_n\","
                "\"analysis\":\"min|max|mean|median\","
                "\"order\":\"ascending|descending\""
                "}\n"
                "\n"
                "Rules:\n"
                "- Do NOT choose id/grouping columns (borocode, large_n, small_n, geom, ids).\n"
                "- Use semantically matched pairs. Examples:\n"
                "  height → height_avg (street_block) ↔ heightroof (buildings)\n"
                "  value  → value_avg (street_block) ↔ value_sqft (buildings)\n"
                "  density → density_s (street_block) ↔ density_b (buildings)\n"
                "- If unsure, set BOTH column_s and column_b to \"NO_MATCH\".\n"
                "- scale default = large_n.\n"
                "- If question asks for highest/biggest/tallest → order=descending.\n"
                "- JSON only."
            ),
        },
        {
            "role": "user",
            "content": f"Schema:\n{DB_SCHEMA_analyze}\n\nQuery:\n{query}",
        },
    ]


def build_compare_plan(query: str) -> list:
    return [
        {
            "role": "system",
            "content": (
                "You convert a natural-language comparison query into a structured compare plan.\n"
                "\n"
                "Return JSON only, with exactly these keys:\n"
                "{"
                "\"column\":\"...\","
                "\"dtype\":\"numeric|categorical|boolean\","
                "\"scale\":\"borough|large_n\","
                "\"region1\": null|int|string,"
                "\"region2\": null|int|string,"
                "\"table\":\"street_block|buildings\","
                "\"filters\":[[\"col\",\"op\",\"value\"], ...]"
                "}\n"
                "\n"
                "Rules:\n"
                "- column must exist in the chosen table and match dtype.\n"
                "- dtype is inferred from DB_SCHEMA.\n"
                "- The query must describe a comparison between two regions.\n"
                "- scale = \"borough\" when regions are boroughs; scale = \"large_n\" when regions are large neighborhoods.\n"
                "- region1 and region2 are the two regions the query wants to compare, and they must be in the same scale.\n"
                "- If scale = \"borough\":\n"
                "  - region1 and region2 are borocode (int, 1–5).\n"
                "  - table = \"street_block\".\n"
                "- If scale = \"large_n\":\n"
                "  - region1 and region2 are large_n names (string).\n"
                "  - table = \"buildings\".\n"
                "- filters is a list of [column, op, value] using only columns from the chosen table, excluding borocode and large_n.\n"
                "- Allowed ops in filters: \"=\", \">\", \"<\", \">=\", \"<=\".\n"
                "- Never use id/grouping-only fields (geom, internal ids) as column.\n"
                "- If you cannot confidently map the query to a valid column, set column = \"NO_MATCH\".\n"
                "\n"
                "Examples (format only, not tied to the schema):\n"
                "Query: \"compare highest building in midtown and downtown manhattan above 100m\"\n"
                "→ {\"column\":\"heightroof\",\"dtype\":\"numeric\",\"scale\":\"large_n\",\"region1\":\"midtown manhattan\",\"region2\":\"downtown manhattan\","
                "\"table\":\"buildings\",\"filters\":[[\"heightroof\",\">\",\"328.084\"]]}\n"
                "\n"
                "Respond with JSON only, no extra text."
            ),
        },
        {
            "role": "user",
            "content": f"Schema:\n{DB_SCHEMA_analyze}\n\nQuery:\n{query}",
        },
    ]
